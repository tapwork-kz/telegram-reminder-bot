import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockRemindersRepository } from "./mockRepository";
import { ReminderScheduler } from "../src/reminders/reminderScheduler";
import { ReminderService } from "../src/reminders/reminderService";
import { TelegramClient } from "../src/telegram/client";
import { Env } from "../src/types";

describe("Concurrency and Independence", () => {
  let mockRepo: MockRemindersRepository;
  let mockTelegram: TelegramClient;
  let env: Env;
  let sentCountByReminderId: Map<string, number>;

  beforeEach(() => {
    mockRepo = new MockRemindersRepository();
    sentCountByReminderId = new Map();

    mockTelegram = {
      sendMessage: vi.fn(async (chatId, text, options) => {
        // Track how many times each text/reminder was sent
        sentCountByReminderId.set(text, (sentCountByReminderId.get(text) || 0) + 1);
        return { message_id: Math.floor(Math.random() * 100000) };
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

  it("should process at least 10 independent reminders independently without cross-interference", async () => {
    const service = new ReminderService(mockRepo as any, env);
    const scheduler = new ReminderScheduler(mockRepo as any, mockTelegram, env);

    const createdIds: number[] = [];

    // Create 10 distinct reminders
    for (let i = 1; i <= 10; i++) {
      const pastTime = new Date(Date.now() - (15 - i) * 60000).toISOString();
      const rem = await mockRepo.create({
        telegram_user_id: 1000 + i,
        telegram_chat_id: 2000 + i,
        description: `Задача #${i}`,
        source_type: "text",
        remind_at: pastTime,
      });
      createdIds.push(rem.id);
    }

    expect(createdIds.length).toBe(10);

    // Initial cron processes all 10
    const res1 = await scheduler.processDueReminders(50);
    expect(res1.processedCount).toBe(10);
    expect(res1.successCount).toBe(10);

    // User #1 marks reminder as completed
    await service.markCompleted(createdIds[0]);

    // User #2 snoozes for 2 hours
    await service.snooze(createdIds[1], "2h");

    // User #3 marks irrelevant
    await service.markIrrelevant(createdIds[2]);

    // Fast-forward repeat time for others
    const now = new Date();
    for (let i = 3; i < 10; i++) {
      const rem = await mockRepo.getById(createdIds[i]);
      if (rem) {
        rem.next_repeat_at = new Date(now.getTime() - 1000).toISOString();
      }
    }

    // Next cron execution
    const res2 = await scheduler.processDueReminders(50);

    // Reminders #1 (completed), #2 (snoozed into future), and #3 (irrelevant) should NOT be processed
    // Reminders #4 to #10 (7 reminders) should be processed!
    expect(res2.processedCount).toBe(7);

    const rem1 = await mockRepo.getById(createdIds[0]);
    const rem2 = await mockRepo.getById(createdIds[1]);
    const rem3 = await mockRepo.getById(createdIds[2]);

    expect(rem1?.status).toBe("completed");
    expect(rem2?.status).toBe("snoozed");
    expect(rem3?.status).toBe("irrelevant");
  });

  it("should prevent duplicate sends when two cron instances run concurrently (idempotency)", async () => {
    // Populate 5 due reminders
    for (let i = 1; i <= 5; i++) {
      await mockRepo.create({
        telegram_user_id: 100 + i,
        telegram_chat_id: 200 + i,
        description: `Параллельная задача #${i}`,
        source_type: "text",
        remind_at: new Date(Date.now() - 10000).toISOString(),
      });
    }

    const scheduler1 = new ReminderScheduler(mockRepo as any, mockTelegram, env);
    const scheduler2 = new ReminderScheduler(mockRepo as any, mockTelegram, env);

    // Run both schedulers in parallel
    const [res1, res2] = await Promise.all([
      scheduler1.processDueReminders(50),
      scheduler2.processDueReminders(50),
    ]);

    // Total processed between the two instances should equal exactly 5 (no duplicates!)
    const totalProcessed = res1.processedCount + res2.processedCount;
    expect(totalProcessed).toBe(5);

    // Verify each reminder was sent only once
    for (const count of sentCountByReminderId.values()) {
      expect(count).toBe(1);
    }
  });
});
