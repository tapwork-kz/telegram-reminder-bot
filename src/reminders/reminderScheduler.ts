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
    // 30s buffer so reminders due within the current minute are claimed immediately
    const checkTimeIso = new Date(now.getTime() + 30 * 1000).toISOString();

    // Generate unique claim token for this cron batch
    const claimToken = `cron-${now.getTime()}-${Math.random().toString(36).substring(2, 9)}`;
    // Claim expires in 3 minutes if worker dies
    const claimExpiresIso = new Date(now.getTime() + 3 * 60 * 1000).toISOString();

    // 1. Atomically claim due reminders
    let claimedReminders: Reminder[] = [];
    try {
      claimedReminders = await this.repo.claimDueReminders(
        checkTimeIso,
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
      } catch (err: any) {
        failureCount++;
        const errMsg = err?.message || String(err);
        logger.error("Failed to process reminder", err, {
          reminder_id: reminder.id,
          error: errMsg,
        });

        // If permanent Telegram delivery failure, mark cancelled to prevent infinite blocking
        if (
          errMsg.includes("chat not found") ||
          errMsg.includes("bot was blocked") ||
          errMsg.includes("user is deactivated")
        ) {
          logger.warn("Permanent delivery failure, cancelling reminder", { reminder_id: reminder.id });
          try {
            await this.repo.markCancelled(reminder.id);
          } catch (cancelErr) {
            logger.error("Failed to mark reminder cancelled", cancelErr);
          }
        } else {
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

    // Requirement 3: Delete previous notification/confirmation message so chat isn't cluttered
    if (reminder.last_message_id) {
      try {
        await this.telegram.deleteMessage(
          reminder.telegram_chat_id,
          reminder.last_message_id
        );
      } catch (delErr) {
        logger.warn("Failed to delete previous reminder notification message", {
          reminder_id: reminder.id,
          old_message_id: reminder.last_message_id,
        });
      }
    }

    // Text formatting: Clean text without '🔔 Напоминание' header
    const timeLabel = isRepeat ? "⏰ Я всё ещё жду выполнения" : "⏰ Сейчас";
    const text = `${reminder.description}\n${timeLabel}`;

    const keyboard = getReminderActionsKeyboard(reminder.id);

    // Send Telegram message
    const sent = await this.telegram.sendMessage(reminder.telegram_chat_id, text, {
      reply_markup: keyboard,
      message_thread_id: reminder.telegram_message_thread_id,
    });

    // Compute next repeat timestamp: now + repeatIntervalMinutes (default 15)
    const nextRepeatDate = new Date(Date.now() + repeatIntervalMinutes * 60 * 1000);
    const nextRepeatIso = nextRepeatDate.toISOString();

    // Atomically transition state and record new message_id
    await this.repo.recordSentNotification(reminder.id, nextRepeatIso, sent.message_id);

    logger.info("Reminder notification sent successfully", {
      reminder_id: reminder.id,
      is_repeat: isRepeat,
      next_repeat_at: nextRepeatIso,
      new_message_id: sent.message_id,
    });
  }
}
