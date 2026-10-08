import { describe, it, expect, vi } from "vitest";
import { MockRemindersRepository } from "./mockRepository";
import { ReminderService } from "../src/reminders/reminderService";
import { Env } from "../src/types";

describe("Voice Processing Pipeline", () => {
  it("should process voice transcription into reminder record with source_type voice", async () => {
    const mockRepo = new MockRemindersRepository();
    const mockAi = {
      run: vi.fn(async (model, input) => {
        return { text: "Завтра в 10 утра забрать документы" };
      }),
    };

    const env: Env = {
      DB: {} as any,
      AI: mockAi,
      TIMEZONE: "Asia/Almaty",
    };

    const service = new ReminderService(mockRepo as any, env);

    // Simulated dummy audio buffer
    const dummyBuffer = new ArrayBuffer(1024);

    const result = await service.createFromVoice(
      dummyBuffer,
      "audio/ogg",
      555555,
      666666,
      null
    );

    expect(result.reminder).not.toBeNull();
    expect(result.reminder?.source_type).toBe("voice");
    expect(result.reminder?.description).toBe("Забрать документы");
    expect(result.messageText).toContain("🎤 Распознано: «Завтра в 10 утра забрать документы»");
    expect(result.messageText).toContain("🔔 Напоминание создано");
  });
});
