import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockRemindersRepository } from "./mockRepository";
import { ReminderScheduler } from "../src/reminders/reminderScheduler";
import { ReminderService } from "../src/reminders/reminderService";
import { TelegramClient } from "../src/telegram/client";
import { Env } from "../src/types";

describe("Reminder Scheduler & Lifecycle", () => {
  let mockRepo: MockRemindersRepository;
  let mockTelegram: TelegramClient;
  let env: Env;
  let sentMessages: Array<{ chatId: number | string; text: string; options?: any }>;

  beforeEach(() => {
    mockRepo = new MockRemindersRepository();
    sentMessages = [];

    mockTelegram = {
      sendMessage: vi.fn(async (chatId, text, options) => {
        sentMessages.push({ chatId, text, options });
        return { message_id: 100 + sentMessages.length };
      }),
      editMessageText: vi.fn(async () => true),
      editMessageReplyMarkup: vi.fn(async () => true),
      answerCallbackQuery: vi.fn(async () => true),
    } as unknown as TelegramClient;

    env = {
      DB: {} as any,
      TELEGRAM_BOT_TOKEN: "mock_token",
      TIMEZONE: "Asia/Almaty",
      REPEAT_INTERVAL_MINUTES: "15",
    };
  });

  it("should trigger notification when remind_at is reached", async () => {
    const scheduler = new ReminderScheduler(mockRepo as any, mockTelegram, env);

    // Create reminder scheduled in the past / now
    const pastIso = new Date(Date.now() - 5000).toISOString();
    const reminder = await mockRepo.create({
      telegram_user_id: 111,
      telegram_chat_id: 222,
      description: "Позвонить клиенту",
      source_type: "text",
      remind_at: pastIso,
    });

    const res = await scheduler.processDueReminders();
    expect(res.processedCount).toBe(1);
    expect(res.successCount).toBe(1);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain("🔔 Напоминание");
    expect(sentMessages[0].text).toContain("Позвонить клиенту");
    expect(sentMessages[0].text).toContain("⏰ Сейчас");

    // Verify reminder is now marked as 'sent' with next_repeat_at set to ~15 min
    const updated = await mockRepo.getById(reminder.id);
    expect(updated?.status).toBe("sent");
    expect(updated?.next_repeat_at).toBeDefined();
  });

  it("should repeat notification after 15 minutes if not completed", async () => {
    const scheduler = new ReminderScheduler(mockRepo as any, mockTelegram, env);

    // Create a reminder that was already sent 16 minutes ago
    const reminder = await mockRepo.create({
      telegram_user_id: 111,
      telegram_chat_id: 222,
      description: "Купить молоко",
      source_type: "text",
      remind_at: new Date(Date.now() - 30 * 60000).toISOString(),
    });

    // Mark it as sent with next_repeat_at 1 minute in the past
    await mockRepo.recordSentNotification(
      reminder.id,
      new Date(Date.now() - 60000).toISOString()
    );

    const res = await scheduler.processDueReminders();
    expect(res.processedCount).toBe(1);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain("🔔 Напоминание");
    expect(sentMessages[0].text).toContain("Купить молоко");
    expect(sentMessages[0].text).toContain("⏰ Я всё ещё жду выполнения");

    // The single record should be updated with a new next_repeat_at, NOT duplicated
    expect(mockRepo.reminders.size).toBe(1);
    const current = await mockRepo.getById(reminder.id);
    expect(current?.status).toBe("sent");
  });

  it("should handle snooze 2h, 4h, tomorrow 09:00, 3 days, 7 days", async () => {
    const service = new ReminderService(mockRepo as any, env);

    const reminder = await mockRepo.create({
      telegram_user_id: 111,
      telegram_chat_id: 222,
      description: "Отчёт",
      source_type: "text",
      remind_at: new Date().toISOString(),
    });

    // Snooze 2 hours
    const snz2h = await service.snooze(reminder.id, "2h");
    expect(snz2h.reminder?.status).toBe("snoozed");
    expect(snz2h.reminder?.snooze_count).toBe(1);

    // Snooze 4 hours
    const snz4h = await service.snooze(reminder.id, "4h");
    expect(snz4h.reminder?.snooze_count).toBe(2);

    // Snooze tomorrow 09:00
    const snzTom = await service.snooze(reminder.id, "tom");
    expect(snzTom.reminder?.snooze_count).toBe(3);
    expect(snzTom.displayTime).toContain("09:00");

    // Snooze 3 days
    const snz3d = await service.snooze(reminder.id, "3d");
    expect(snz3d.reminder?.snooze_count).toBe(4);

    // Snooze 7 days
    const snz7d = await service.snooze(reminder.id, "7d");
    expect(snz7d.reminder?.snooze_count).toBe(5);
  });

  it("should stop repeats when reminder is completed", async () => {
    const scheduler = new ReminderScheduler(mockRepo as any, mockTelegram, env);
    const service = new ReminderService(mockRepo as any, env);

    const reminder = await mockRepo.create({
      telegram_user_id: 111,
      telegram_chat_id: 222,
      description: "Забрать посылку",
      source_type: "text",
      remind_at: new Date(Date.now() - 5000).toISOString(),
    });

    // User completes reminder
    await service.markCompleted(reminder.id);

    const check = await mockRepo.getById(reminder.id);
    expect(check?.status).toBe("completed");
    expect(check?.completed_at).toBeDefined();

    // Cron runs: no messages sent
    const res = await scheduler.processDueReminders();
    expect(res.processedCount).toBe(0);
    expect(sentMessages.length).toBe(0);
  });

  it("should stop repeats when reminder is marked irrelevant", async () => {
    const scheduler = new ReminderScheduler(mockRepo as any, mockTelegram, env);
    const service = new ReminderService(mockRepo as any, env);

    const reminder = await mockRepo.create({
      telegram_user_id: 111,
      telegram_chat_id: 222,
      description: "Старая задача",
      source_type: "text",
      remind_at: new Date(Date.now() - 5000).toISOString(),
    });

    // User marks irrelevant
    await service.markIrrelevant(reminder.id);

    const check = await mockRepo.getById(reminder.id);
    expect(check?.status).toBe("irrelevant");

    // Cron runs: no messages sent
    const res = await scheduler.processDueReminders();
    expect(res.processedCount).toBe(0);
    expect(sentMessages.length).toBe(0);
  });
});
