import { TelegramClient } from "./client";
import { ReminderService } from "../reminders/reminderService";
import { RemindersRepository } from "../db/remindersRepository";
import { getSnoozeOptionsKeyboard, getReminderActionsKeyboard } from "./keyboards";
import { TelegramCallbackQuery } from "../types";
import { logger } from "../utils/logger";

export class CallbackHandler {
  constructor(
    private telegram: TelegramClient,
    private service: ReminderService,
    private repo: RemindersRepository
  ) {}

  async handle(query: TelegramCallbackQuery): Promise<void> {
    const data = query.data || "";
    const callbackId = query.id;
    const message = query.message;

    if (!message) {
      await this.telegram.answerCallbackQuery(callbackId);
      return;
    }

    const chatId = message.chat.id;
    const messageId = message.message_id;

    logger.info("Handling callback query", { data, user_id: query.from.id });

    // 1. Done action: done:<id>
    if (data.startsWith("done:")) {
      const id = parseInt(data.split(":")[1], 10);
      const reminder = await this.repo.getById(id);
      if (!reminder) {
        await this.telegram.answerCallbackQuery(callbackId, "Напоминание не найдено");
        return;
      }

      await this.service.markCompleted(id);
      await this.telegram.answerCallbackQuery(callbackId, "Отлично! Отмечено выполненным.");

      const updatedText = `✅ Выполнено\n${reminder.description}`;
      await this.telegram.editMessageText(chatId, messageId, updatedText, {
        reply_markup: null,
      });
      return;
    }

    // 2. Irrelevant action: irrel:<id>
    if (data.startsWith("irrel:")) {
      const id = parseInt(data.split(":")[1], 10);
      const reminder = await this.repo.getById(id);
      if (!reminder) {
        await this.telegram.answerCallbackQuery(callbackId, "Напоминание не найдено");
        return;
      }

      await this.service.markIrrelevant(id);
      await this.telegram.answerCallbackQuery(callbackId, "Закрыто как неактуальное.");

      const updatedText = `❌ Напоминание закрыто как неактуальное.\n${reminder.description}`;
      await this.telegram.editMessageText(chatId, messageId, updatedText, {
        reply_markup: null,
      });
      return;
    }

    // 3. Open Snooze options: snooze:<id>
    if (data.startsWith("snooze:")) {
      const id = parseInt(data.split(":")[1], 10);
      const reminder = await this.repo.getById(id);
      if (!reminder) {
        await this.telegram.answerCallbackQuery(callbackId, "Напоминание не найдено");
        return;
      }

      await this.telegram.answerCallbackQuery(callbackId);
      const promptText = `🔔 Напоминание\n${reminder.description}\n\nВыберите время, на которое отложить:`;
      await this.telegram.editMessageText(chatId, messageId, promptText, {
        reply_markup: getSnoozeOptionsKeyboard(id),
      });
      return;
    }

    // 4. Back button from snooze options: back:<id>
    if (data.startsWith("back:")) {
      const id = parseInt(data.split(":")[1], 10);
      const reminder = await this.repo.getById(id);
      if (!reminder) {
        await this.telegram.answerCallbackQuery(callbackId);
        return;
      }

      await this.telegram.answerCallbackQuery(callbackId);
      const originalText = `🔔 Напоминание\n${reminder.description}\n⏰ ${reminder.status === "sent" ? "Я всё ещё жду выполнения" : "Сейчас"}`;
      await this.telegram.editMessageText(chatId, messageId, originalText, {
        reply_markup: getReminderActionsKeyboard(id),
      });
      return;
    }

    // 5. Apply Snooze: snz:<type>:<id>
    if (data.startsWith("snz:")) {
      const parts = data.split(":");
      const snoozeType = parts[1] as "2h" | "4h" | "tom" | "3d" | "7d";
      const id = parseInt(parts[2], 10);

      const reminder = await this.repo.getById(id);
      if (!reminder) {
        await this.telegram.answerCallbackQuery(callbackId, "Напоминание не найдено");
        return;
      }

      const { displayTime } = await this.service.snooze(id, snoozeType);
      await this.telegram.answerCallbackQuery(callbackId, `Отложено до: ${displayTime}`);

      const updatedText = `⏰ Отложено\n${reminder.description}\n⏰ ${displayTime}`;
      await this.telegram.editMessageText(chatId, messageId, updatedText, {
        reply_markup: null,
      });
      return;
    }

    // Unknown or unhandled callback
    await this.telegram.answerCallbackQuery(callbackId);
  }
}
