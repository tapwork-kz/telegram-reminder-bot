import { describe, it, expect, vi } from "vitest";
import { extractDescriptionFromBotMessage } from "../src/reminders/reminderParser";
import { ReminderService } from "../src/reminders/reminderService";
import { RemindersRepository } from "../src/db/remindersRepository";
import { Reminder } from "../src/types";

describe("Supplementing Reminders", () => {
  it("should extract description from confirmation bot message", () => {
    const text = "Сделать собрание\n⏰ Через 30 минут";
    const desc = extractDescriptionFromBotMessage(text);
    expect(desc).toBe("Сделать собрание");
  });

  it("should extract description from notification bot message with or without header", () => {
    const text = "Сделать собрание вечером\n⏰ Сейчас";
    const desc = extractDescriptionFromBotMessage(text);
    expect(desc).toBe("Сделать собрание вечером");
  });

  it("should extract description from supplemented bot message", () => {
    const text = "✏️ Дополнено:\nСделать собрание вечером\n⏰ Сегодня в 19:00";
    const desc = extractDescriptionFromBotMessage(text);
    expect(desc).toBe("Сделать собрание вечером");
  });

  it("should supplement reminder description and update time for 'вечером'", async () => {
    const mockRepo = {
      supplement: vi.fn().mockImplementation((id, desc, remindAt, status) => {
        return Promise.resolve({
          id,
          description: desc,
          remind_at: remindAt,
          status: status || "scheduled",
        } as Reminder);
      }),
    } as unknown as RemindersRepository;

    const mockEnv = {
      DB: {} as any,
      TIMEZONE: "Asia/Almaty",
    };

    const service = new ReminderService(mockRepo, mockEnv);

    const initialReminder: Reminder = {
      id: 10,
      telegram_user_id: 12345,
      telegram_chat_id: 12345,
      description: "Сделать собрание",
      source_type: "text",
      remind_at: "2026-10-09T05:30:00.000Z",
      repeat_interval_minutes: 15,
      status: "scheduled",
      snooze_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await service.supplementReminder(initialReminder, "вечером");

    expect(result.reminder.description).toBe("Сделать собрание вечером");
    expect(result.messageText).toContain("✏️ Дополнено:\nСделать собрание вечером");
    expect(result.messageText).toContain("⏰");
    expect(mockRepo.supplement).toHaveBeenCalled();
  });

  it("should supplement reminder description without changing time when reply has no time", async () => {
    const mockRepo = {
      supplement: vi.fn().mockImplementation((id, desc, remindAt, status) => {
        return Promise.resolve({
          id,
          description: desc,
          remind_at: remindAt,
          status: status || "scheduled",
        } as Reminder);
      }),
    } as unknown as RemindersRepository;

    const mockEnv = {
      DB: {} as any,
      TIMEZONE: "Asia/Almaty",
    };

    const service = new ReminderService(mockRepo, mockEnv);

    const initialReminder: Reminder = {
      id: 11,
      telegram_user_id: 12345,
      telegram_chat_id: 12345,
      description: "Купить молоко",
      source_type: "text",
      remind_at: "2026-10-09T05:30:00.000Z",
      repeat_interval_minutes: 15,
      status: "scheduled",
      snooze_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await service.supplementReminder(initialReminder, "и хлеб");

    expect(result.reminder.description).toBe("Купить молоко и хлеб");
    expect(result.reminder.remind_at).toBe(initialReminder.remind_at);
    expect(result.messageText).toContain("✏️ Дополнено:\nКупить молоко и хлеб");
  });

  it("should apply T9 autocorrect when supplementing reminder", async () => {
    const mockRepo = {
      supplement: vi.fn().mockImplementation((id, desc, remindAt, status) => {
        return Promise.resolve({
          id,
          description: desc,
          remind_at: remindAt,
          status: status || "scheduled",
        } as Reminder);
      }),
    } as unknown as RemindersRepository;

    const mockEnv = {
      DB: {} as any,
      TIMEZONE: "Asia/Almaty",
    };

    const service = new ReminderService(mockRepo, mockEnv);

    const initialReminder: Reminder = {
      id: 12,
      telegram_user_id: 12345,
      telegram_chat_id: 12345,
      description: "Провести собрание",
      source_type: "text",
      remind_at: "2026-10-09T05:30:00.000Z",
      repeat_interval_minutes: 15,
      status: "scheduled",
      snooze_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await service.supplementReminder(initialReminder, "по уценке бродажей");

    expect(result.reminder.description).toBe("Провести собрание по уценке продаж");
    expect(result.messageText).toContain("✏️ Дополнено:\nПровести собрание по уценке продаж");
  });
});
