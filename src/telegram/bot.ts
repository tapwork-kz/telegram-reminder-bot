import { TelegramClient } from "./client";
import { ReminderService } from "../reminders/reminderService";
import { RemindersRepository } from "../db/remindersRepository";
import { CallbackHandler } from "./callbacks";
import { isUserAllowed, getTimezone } from "../config";
import { formatForUser } from "../utils/dates";
import { Env, TelegramUpdate, TelegramMessage } from "../types";
import { logger } from "../utils/logger";
import { extractDescriptionFromBotMessage } from "../reminders/reminderParser";
import { transcribeAudio } from "../voice/transcription";

export class TelegramBot {
  private client: TelegramClient;
  private repo: RemindersRepository;
  private service: ReminderService;
  private callbacks: CallbackHandler;

  constructor(private env: Env) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN environment secret is missing");
    }
    this.client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
    this.repo = new RemindersRepository(env.DB);
    this.service = new ReminderService(this.repo, env);
    this.callbacks = new CallbackHandler(this.client, this.service, this.repo);
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    // 1. Handle Callback Queries (Inline buttons)
    if (update.callback_query) {
      const fromUser = update.callback_query.from;
      if (!isUserAllowed(fromUser.id, this.env)) {
        await this.client.answerCallbackQuery(update.callback_query.id, "Доступ запрещён.");
        return;
      }
      await this.callbacks.handle(update.callback_query);
      return;
    }

    // 2. Handle Messages
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }
  }

  private async handleMessage(msg: TelegramMessage): Promise<void> {
    const fromUser = msg.from;
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id;

    if (!fromUser) return;

    // Check Whitelist (Section 5)
    if (!isUserAllowed(fromUser.id, this.env)) {
      logger.warn("Unauthorized access attempt", { user_id: fromUser.id });
      await this.client.sendMessage(chatId, `⛔ Доступ запрещён.\nВаш Telegram ID: ${fromUser.id}`, {
        message_thread_id: threadId,
      });
      return;
    }

    const text = msg.text?.trim() || "";

    // Commands handling
    if (text.startsWith("/")) {
      await this.handleCommand(text, msg);
      return;
    }

    // Check if this is a reply to a previous message (Supplementing Reminders)
    if (msg.reply_to_message) {
      const handled = await this.handleReplyMessage(msg);
      if (handled) return;
    }

    // Voice message handling (Section 8)
    if (msg.voice || msg.audio) {
      await this.handleVoiceMessage(msg);
      return;
    }

    // Regular text message handling (Section 6, 7)
    if (text) {
      await this.handleTextMessage(text, msg);
      return;
    }
  }

  private async handleCommand(commandText: string, msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id;
    const userId = msg.from!.id;
    const command = commandText.split(" ")[0].toLowerCase().replace("@notifibai_bot", "");

    switch (command) {
      case "/start": {
        const welcome =
          `👋 Привет! Я твой персональный бот напоминаний.\n\n` +
          `Отправь мне текст или голосовое сообщение, например:\n` +
          `• «Напомни через час позвонить клиенту»\n` +
          `• «Завтра в 10 утра забрать документы»\n` +
          `• «Напомни купить молоко» (по умолчанию через 30 минут)\n` +
          `• «В пятницу в 18:00 позвонить маме»\n` +
          `• «Через 3 дня проверить отчёт»\n\n` +
          `ℹ️ Ваш Telegram ID: <code>${userId}</code>\n` +
          `Часовой пояс: <b>${getTimezone(this.env)}</b>\n\n` +
          `Используйте /help для списка всех команд.`;

        await this.client.sendMessage(chatId, welcome, {
          message_thread_id: threadId,
          parse_mode: "HTML",
        });
        break;
      }

      case "/help": {
        const help =
          `📖 <b>Справка по боту:</b>\n\n` +
          `<b>Как ставить напоминания:</b>\n` +
          `1. <i>Текстом:</i> «Напомни через 2 часа подготовить договор»\n` +
          `2. <i>Голосом:</i> Запишите голосовое сообщение с задачей и временем.\n` +
          `3. <i>Без времени:</i> Если время не указано, бот установит напоминание через 30 минут.\n\n` +
          `<b>Команды:</b>\n` +
          `/reminders — список всех активных напоминаний\n` +
          `/today — напоминания на сегодня\n` +
          `/help — данная справка\n` +
          `/cancel — справка по отмене`;

        await this.client.sendMessage(chatId, help, {
          message_thread_id: threadId,
          parse_mode: "HTML",
        });
        break;
      }

      case "/reminders": {
        const active = await this.service.getActiveReminders(userId);
        if (active.length === 0) {
          await this.client.sendMessage(chatId, "📭 У вас нет активных напоминаний.", {
            message_thread_id: threadId,
          });
          return;
        }

        const timeZone = getTimezone(this.env);
        const now = new Date();
        const lines = active.map((r, i) => {
          const formatted = formatForUser(r.remind_at, now, timeZone);
          const icon = r.status === "snoozed" ? "⏰ (отложено)" : r.status === "sent" ? "⚠️ (ждёт)" : "⏳";
          return `${i + 1}. <b>${r.description}</b> — ${formatted} ${icon}`;
        });

        const textResp = `🔔 <b>Активные напоминания (${active.length}):</b>\n\n` + lines.join("\n");
        await this.client.sendMessage(chatId, textResp, {
          message_thread_id: threadId,
          parse_mode: "HTML",
        });
        break;
      }

      case "/today": {
        const active = await this.service.getActiveReminders(userId);
        const timeZone = getTimezone(this.env);
        const now = new Date();

        const todayList = active.filter((r) => {
          const formatted = formatForUser(r.remind_at, now, timeZone);
          return formatted.startsWith("Сегодня");
        });

        if (todayList.length === 0) {
          await this.client.sendMessage(chatId, "📅 На сегодня напоминаний нет.", {
            message_thread_id: threadId,
          });
          return;
        }

        const lines = todayList.map((r, i) => {
          const formatted = formatForUser(r.remind_at, now, timeZone);
          return `${i + 1}. <b>${r.description}</b> — ${formatted}`;
        });

        await this.client.sendMessage(chatId, `📅 <b>Напоминания на сегодня:</b>\n\n` + lines.join("\n"), {
          message_thread_id: threadId,
          parse_mode: "HTML",
        });
        break;
      }

      case "/cancel": {
        await this.client.sendMessage(
          chatId,
          "Чтобы отменить напоминание, нажмите кнопку «❌ Неактуально» в самом напоминании, либо выполните его кнопкой «✅ Выполнено».",
          { message_thread_id: threadId }
        );
        break;
      }

      default: {
        await this.client.sendMessage(chatId, "Неизвестная команда. Введите /help для справки.", {
          message_thread_id: threadId,
        });
      }
    }
  }

  private async handleTextMessage(text: string, msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id;
    const userId = msg.from!.id;

    try {
      const res = await this.service.createFromText(text, userId, chatId, threadId);
      const sent = await this.client.sendMessage(chatId, res.messageText, {
        message_thread_id: threadId,
      });

      if (res.reminder && sent?.message_id) {
        await this.repo.updateLastMessageId(res.reminder.id, sent.message_id);
      }
    } catch (err: any) {
      logger.error("Error creating reminder from text", err, { user_id: userId });
      await this.client.sendMessage(chatId, "Произошла ошибка при создании напоминания. Попробуйте ещё раз.", {
        message_thread_id: threadId,
      });
    }
  }

  private async handleVoiceMessage(msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id;
    const userId = msg.from!.id;
    const voiceOrAudio = msg.voice || msg.audio;

    if (!voiceOrAudio) return;

    // Check duration / size (Section 30)
    if (voiceOrAudio.duration > 300) {
      await this.client.sendMessage(chatId, "⚠️ Голосовое сообщение слишком длинное (максимум 5 минут).", {
        message_thread_id: threadId,
      });
      return;
    }

    if (voiceOrAudio.file_size && voiceOrAudio.file_size > 20 * 1024 * 1024) {
      await this.client.sendMessage(chatId, "⚠️ Аудиофайл слишком большой (максимум 20 МБ).", {
        message_thread_id: threadId,
      });
      return;
    }

    try {
      // 1. Get file path from Telegram
      const fileInfo = await this.client.getFile(voiceOrAudio.file_id);
      if (!fileInfo.file_path) {
        throw new Error("Telegram did not return file_path");
      }

      // 2. Download audio bytes
      const audioBytes = await this.client.downloadFile(fileInfo.file_path);

      // 3. Transcribe and create
      const res = await this.service.createFromVoice(
        audioBytes,
        voiceOrAudio.mime_type || "audio/ogg",
        userId,
        chatId,
        threadId
      );

      const sent = await this.client.sendMessage(chatId, res.messageText, {
        message_thread_id: threadId,
      });

      if (res.reminder && sent?.message_id) {
        await this.repo.updateLastMessageId(res.reminder.id, sent.message_id);
      }
    } catch (err: any) {
      logger.error("Error processing voice message", err, { user_id: userId });
      await this.client.sendMessage(
        chatId,
        "⚠️ Не удалось обработать голосовое сообщение. Попробуйте отправить текстом.",
        { message_thread_id: threadId }
      );
    }
  }

  private async handleReplyMessage(msg: TelegramMessage): Promise<boolean> {
    const fromUser = msg.from;
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id;
    const replyTo = msg.reply_to_message;

    if (!fromUser || !replyTo) return false;

    // 1. Extract content from the reply (text or voice)
    let replyContent = msg.text?.trim() || "";

    const voiceOrAudio = msg.voice || msg.audio;
    if (voiceOrAudio && !replyContent) {
      try {
        const fileInfo = await this.client.getFile(voiceOrAudio.file_id);
        if (fileInfo.file_path) {
          const audioBytes = await this.client.downloadFile(fileInfo.file_path);
          const transcription = await transcribeAudio(
            audioBytes,
            voiceOrAudio.mime_type || "audio/ogg",
            this.env
          );
          replyContent = transcription.text.trim();
        }
      } catch (err) {
        logger.error("Failed to transcribe reply voice", err);
      }
    }

    if (!replyContent) return false;

    // 2. Locate target reminder:
    // A) By reply_to_message.message_id
    let targetReminder = await this.repo.findByMessageId(replyTo.message_id, fromUser.id);

    // B) Fallback: match by description snippet from reply_to.text
    if (!targetReminder && replyTo.text) {
      const snippet = extractDescriptionFromBotMessage(replyTo.text);
      if (snippet) {
        targetReminder = await this.repo.findByDescriptionMatch(fromUser.id, snippet);
      }
    }

    // C) Fallback: if only one active reminder exists for user
    if (!targetReminder && replyTo.text) {
      const activeList = await this.repo.getActiveForUser(fromUser.id);
      if (activeList.length === 1) {
        targetReminder = activeList[0];
      }
    }

    if (!targetReminder) {
      return false; // Not a recognized reminder reply -> let standard handler process it
    }

    // 3. Supplement reminder
    try {
      const res = await this.service.supplementReminder(targetReminder, replyContent);
      const sent = await this.client.sendMessage(chatId, res.messageText, {
        message_thread_id: threadId,
      });

      if (sent?.message_id) {
        await this.repo.updateLastMessageId(targetReminder.id, sent.message_id);
      }
      return true;
    } catch (err: any) {
      logger.error("Error supplementing reminder", err, { reminder_id: targetReminder.id });
      await this.client.sendMessage(chatId, "⚠️ Не удалось дополнить напоминание. Попробуйте ещё раз.", {
        message_thread_id: threadId,
      });
      return true;
    }
  }
}
