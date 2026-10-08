import { RemindersRepository } from "../db/remindersRepository";
import { parseReminderText } from "./reminderParser";
import { transcribeAudio } from "../voice/transcription";
import {
  formatForUser,
  getTomorrowAtHourIso,
  DEFAULT_TIMEZONE,
} from "../utils/dates";
import { Env, Reminder, ReminderSource } from "../types";
import { getTimezone, getDefaultReminderMinutes } from "../config";
import { logger } from "../utils/logger";

export interface CreateReminderOutput {
  reminder: Reminder | null;
  messageText: string;
  isPast?: boolean;
}

export class ReminderService {
  constructor(private repo: RemindersRepository, private env: Env) {}

  /**
   * Process raw text message to create a reminder.
   */
  async createFromText(
    text: string,
    userId: number,
    chatId: number,
    threadId?: number | null
  ): Promise<CreateReminderOutput> {
    const timeZone = getTimezone(this.env);
    const defaultMins = getDefaultReminderMinutes(this.env);
    const now = new Date();

    const parsed = parseReminderText(text, now, timeZone, defaultMins);

    if (parsed.isPast) {
      return {
        reminder: null,
        messageText: "⚠️ Указанное время уже прошло. Пожалуйста, укажите время в будущем.",
        isPast: true,
      };
    }

    if (!parsed.description) {
      return {
        reminder: null,
        messageText: "Не удалось определить суть напоминания. Пожалуйста, напишите подробнее, например:\n«Напомни завтра в 10:00 позвонить клиенту»",
      };
    }

    const reminder = await this.repo.create({
      telegram_user_id: userId,
      telegram_chat_id: chatId,
      telegram_message_thread_id: threadId,
      description: parsed.description,
      original_text: text,
      source_type: "text",
      remind_at: parsed.remindAtUtcIso,
    });

    const displayTime = formatForUser(parsed.remindAtUtcIso, now, timeZone);
    const responseText = `🔔 Напоминание создано\n${reminder.description}\n⏰ ${displayTime}`;

    logger.info("Reminder created from text", {
      reminder_id: reminder.id,
      user_id: userId,
      has_explicit_time: parsed.hasExplicitTime,
    });

    return {
      reminder,
      messageText: responseText,
    };
  }

  /**
   * Process voice audio message: download -> STT -> parse -> create.
   */
  async createFromVoice(
    audioBytes: ArrayBuffer,
    mimeType: string,
    userId: number,
    chatId: number,
    threadId?: number | null
  ): Promise<CreateReminderOutput> {
    const timeZone = getTimezone(this.env);
    const defaultMins = getDefaultReminderMinutes(this.env);
    const now = new Date();

    // 1. Transcribe voice audio
    const transcription = await transcribeAudio(audioBytes, mimeType, this.env);
    const recognizedText = transcription.text.trim();

    if (!recognizedText) {
      return {
        reminder: null,
        messageText: "⚠️ Не удалось распознать голосовое сообщение. Попробуйте записать ещё раз или отправить текстом.",
      };
    }

    // 2. Parse text
    const parsed = parseReminderText(recognizedText, now, timeZone, defaultMins);

    if (parsed.isPast) {
      return {
        reminder: null,
        messageText: `🎤 Я распознал: «${recognizedText}»\n⚠️ Указанное время уже прошло.`,
        isPast: true,
      };
    }

    const reminder = await this.repo.create({
      telegram_user_id: userId,
      telegram_chat_id: chatId,
      telegram_message_thread_id: threadId,
      description: parsed.description || recognizedText,
      original_text: recognizedText,
      source_type: "voice",
      remind_at: parsed.remindAtUtcIso,
    });

    const displayTime = formatForUser(parsed.remindAtUtcIso, now, timeZone);
    const responseText = `🎤 Распознано: «${recognizedText}»\n\n🔔 Напоминание создано\n${reminder.description}\n⏰ ${displayTime}`;

    logger.info("Reminder created from voice", {
      reminder_id: reminder.id,
      user_id: userId,
    });

    return {
      reminder,
      messageText: responseText,
    };
  }

  /**
   * Snooze a reminder.
   * Options: 2h, 4h, tom (tomorrow 09:00 Asia/Almaty), 3d, 7d
   */
  async snooze(
    reminderId: number,
    snoozeType: "2h" | "4h" | "tom" | "3d" | "7d"
  ): Promise<{ reminder: Reminder | null; displayTime: string }> {
    const now = new Date();
    const timeZone = getTimezone(this.env);

    let nextRemindAt: Date;

    switch (snoozeType) {
      case "2h":
        nextRemindAt = new Date(now.getTime() + 2 * 3600 * 1000);
        break;
      case "4h":
        nextRemindAt = new Date(now.getTime() + 4 * 3600 * 1000);
        break;
      case "tom": {
        // Tomorrow at 09:00 in Asia/Almaty
        const tomorrowIso = getTomorrowAtHourIso(9, 0, now, timeZone);
        nextRemindAt = new Date(tomorrowIso);
        break;
      }
      case "3d":
        nextRemindAt = new Date(now.getTime() + 3 * 86400 * 1000);
        break;
      case "7d":
        nextRemindAt = new Date(now.getTime() + 7 * 86400 * 1000);
        break;
    }

    const nextRemindIso = nextRemindAt.toISOString();
    const updated = await this.repo.snooze(reminderId, nextRemindIso);
    const displayTime = formatForUser(nextRemindIso, now, timeZone);

    logger.info("Reminder snoozed", {
      reminder_id: reminderId,
      snooze_type: snoozeType,
      remind_at: nextRemindIso,
    });

    return {
      reminder: updated,
      displayTime,
    };
  }

  async markCompleted(reminderId: number): Promise<Reminder | null> {
    const res = await this.repo.markCompleted(reminderId);
    logger.info("Reminder marked completed", { reminder_id: reminderId });
    return res;
  }

  async markIrrelevant(reminderId: number): Promise<Reminder | null> {
    const res = await this.repo.markIrrelevant(reminderId);
    logger.info("Reminder marked irrelevant", { reminder_id: reminderId });
    return res;
  }

  async getActiveReminders(userId: number): Promise<Reminder[]> {
    return await this.repo.getActiveForUser(userId);
  }
}
