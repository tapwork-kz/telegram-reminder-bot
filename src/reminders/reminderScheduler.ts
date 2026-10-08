import { RemindersRepository } from "../db/remindersRepository";
import { TelegramClient } from "../telegram/client";
import { getReminderActionsKeyboard } from "../telegram/keyboards";
import { logger } from "../utils/logger";
import { Env, Reminder } from "../types";
import { getRepeatIntervalMinutes } from "../config";

export interface SchedulerRunResult {
  processedCount: number;
  successCount: number;
  failureCount: number;
}

export class ReminderScheduler {
  constructor(
    private repo: RemindersRepository,
    private telegram: TelegramClient,
    private env: Env
  ) {}

  /**
   * Main cron execution loop. Idempotent and concurrency-safe.
   */
  async processDueReminders(limit: number = 25): Promise<SchedulerRunResult> {
    const now = new Date();
    const nowIso = now.toISOString();

    // Generate unique claim token for this cron batch
    const claimToken = `cron-${now.getTime()}-${Math.random().toString(36).substring(2, 9)}`;
    // Claim expires in 3 minutes if worker dies
    const claimExpiresIso = new Date(now.getTime() + 3 * 60 * 1000).toISOString();

    // 1. Atomically claim due reminders
    let claimedReminders: Reminder[] = [];
    try {
      claimedReminders = await this.repo.claimDueReminders(
        nowIso,
        claimToken,
        claimExpiresIso,
        limit
      );
    } catch (err) {
      logger.error("Failed to claim due reminders from D1", err);
      return { processedCount: 0, successCount: 0, failureCount: 0 };
    }

    if (claimedReminders.length === 0) {
      return { processedCount: 0, successCount: 0, failureCount: 0 };
    }

    logger.info("Claimed due reminders for processing", {
      count: claimedReminders.length,
      claimToken,
    });

    let successCount = 0;
    let failureCount = 0;

    const repeatIntervalMinutes = getRepeatIntervalMinutes(this.env);

    // 2. Process each claimed reminder independently
    for (const reminder of claimedReminders) {
      try {
        await this.processSingleReminder(reminder, repeatIntervalMinutes);
        successCount++;
      } catch (err) {
        failureCount++;
        logger.error("Failed to process reminder", err, {
          reminder_id: reminder.id,
        });
        // Safely release claim so it can be retried
        try {
          await this.repo.releaseClaim(reminder.id);
        } catch (releaseErr) {
          logger.error("Failed to release claim for reminder", releaseErr, {
            reminder_id: reminder.id,
          });
        }
      }
    }

    return {
      processedCount: claimedReminders.length,
      successCount,
      failureCount,
    };
  }

  private async processSingleReminder(
    reminder: Reminder,
    repeatIntervalMinutes: number
  ): Promise<void> {
    const isRepeat = reminder.status === "sent";

    // Text formatting according to specification (Section 11, 20, 38)
    const timeLabel = isRepeat ? "⏰ Я всё ещё жду выполнения" : "⏰ Сейчас";
    const text = `🔔 Напоминание\n${reminder.description}\n${timeLabel}`;

    const keyboard = getReminderActionsKeyboard(reminder.id);

    // Send Telegram message
    await this.telegram.sendMessage(reminder.telegram_chat_id, text, {
      reply_markup: keyboard,
      message_thread_id: reminder.telegram_message_thread_id,
    });

    // Compute next repeat timestamp: now + repeatIntervalMinutes (default 15)
    const nextRepeatDate = new Date(Date.now() + repeatIntervalMinutes * 60 * 1000);
    const nextRepeatIso = nextRepeatDate.toISOString();

    // Atomically transition state and record repeat
    await this.repo.recordSentNotification(reminder.id, nextRepeatIso);

    logger.info("Reminder notification sent successfully", {
      reminder_id: reminder.id,
      is_repeat: isRepeat,
      next_repeat_at: nextRepeatIso,
    });
  }
}
