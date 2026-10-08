import { describe, it, expect } from "vitest";
import { parseReminderText } from "../src/reminders/reminderParser";
import { getZonedParts } from "../src/utils/dates";

describe("Reminder Parser", () => {
  // Anchor fixed reference time: 2026-10-08 10:00:00 in Asia/Almaty (UTC+5 -> 2026-10-08T05:00:00Z)
  const baseTime = new Date("2026-10-08T05:00:00.000Z");
  const timeZone = "Asia/Almaty";

  it("should parse 'через час позвонить клиенту'", () => {
    const result = parseReminderText("через час позвонить клиенту", baseTime, timeZone);
    expect(result.description).toBe("Позвонить клиенту");
    expect(result.hasExplicitTime).toBe(true);

    const expectedTime = new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString();
    expect(result.remindAtUtcIso).toBe(expectedTime);
  });

  it("should parse 'завтра в 09:00 купить продукты'", () => {
    const result = parseReminderText("завтра в 09:00 купить продукты", baseTime, timeZone);
    expect(result.description).toBe("Купить продукты");
    expect(result.hasExplicitTime).toBe(true);

    // Tomorrow is 2026-10-09 at 09:00 Almaty time (04:00 UTC)
    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.year).toBe(2026);
    expect(targetParts.month).toBe(10);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(9);
    expect(targetParts.minute).toBe(0);
  });

  it("should parse 'через 3 дня проверить отчёт'", () => {
    const result = parseReminderText("через 3 дня проверить отчёт", baseTime, timeZone);
    expect(result.description).toBe("Проверить отчёт");
    expect(result.hasExplicitTime).toBe(true);

    const expectedTime = new Date(baseTime.getTime() + 3 * 86400 * 1000).toISOString();
    expect(result.remindAtUtcIso).toBe(expectedTime);
  });

  it("should parse 'через неделю позвонить'", () => {
    const result = parseReminderText("через неделю позвонить", baseTime, timeZone);
    expect(result.description).toBe("Позвонить");
    expect(result.hasExplicitTime).toBe(true);

    const expectedTime = new Date(baseTime.getTime() + 7 * 86400 * 1000).toISOString();
    expect(result.remindAtUtcIso).toBe(expectedTime);
  });

  it("should parse 'купить молоко' with default 30 minutes", () => {
    const result = parseReminderText("купить молоко", baseTime, timeZone, 30);
    expect(result.description).toBe("Купить молоко");
    expect(result.hasExplicitTime).toBe(false);

    const expectedTime = new Date(baseTime.getTime() + 30 * 60 * 1000).toISOString();
    expect(result.remindAtUtcIso).toBe(expectedTime);
  });

  it("should parse 'Напомни мне завтра в 10 утра забрать документы'", () => {
    const result = parseReminderText("Напомни мне завтра в 10 утра забрать документы", baseTime, timeZone);
    expect(result.description).toBe("Забрать документы");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(10);
    expect(targetParts.minute).toBe(0);
  });

  it("should parse 'В пятницу в 18:00 позвонить маме'", () => {
    // 2026-10-08 is Thursday (weekday 4). Friday is weekday 5 (+1 day).
    const result = parseReminderText("В пятницу в 18:00 позвонить маме", baseTime, timeZone);
    expect(result.description).toBe("Позвонить маме");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9); // Friday Oct 9
    expect(targetParts.hour).toBe(18);
    expect(targetParts.minute).toBe(0);
  });

  it("should parse relative minutes 'через 30 минут'", () => {
    const result = parseReminderText("через 30 минут проверить духовку", baseTime, timeZone);
    expect(result.description).toBe("Проверить духовку");
    const diffMs = new Date(result.remindAtUtcIso).getTime() - baseTime.getTime();
    expect(diffMs).toBe(30 * 60 * 1000);
  });

  it("should parse 'В 11.30, напомни, провести собрание.' at night and schedule for tomorrow 11:30", () => {
    // 2026-10-08 23:08:00 (night) in Asia/Almaty (18:08 UTC)
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("В 11.30, напомни, провести собрание.", nightTime, timeZone);
    expect(result.description).toBe("Провести собрание");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9); // Tomorrow!
    expect(targetParts.hour).toBe(11);
    expect(targetParts.minute).toBe(30);
  });

  it("should parse phonetic STT 'В 11-30, напомни, провесли с обраньям.' and schedule for tomorrow 11:30", () => {
    // 2026-10-08 23:08:00 (night) in Asia/Almaty (18:08 UTC)
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("В 11-30, напомни, провесли с обраньям.", nightTime, timeZone);
    expect(result.description).toBe("Провести собрание");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9); // Tomorrow!
    expect(targetParts.hour).toBe(11);
    expect(targetParts.minute).toBe(30);
  });

  it("should extract description without trigger words for 'в 11:30 напомни сделать что то'", () => {
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("в 11:30 напомни сделать что то", nightTime, timeZone);
    expect(result.description).toBe("Сделать что то");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(11);
    expect(targetParts.minute).toBe(30);
  });

  it("should strip complex triggers: 'поставь напоминание на завтра в 10:00 забрать документы'", () => {
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("поставь напоминание на завтра в 10:00 забрать документы", nightTime, timeZone);
    expect(result.description).toBe("Забрать документы");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(10);
    expect(targetParts.minute).toBe(0);
  });

  it("should apply T9 autocorrect for 'созвонится по поводу отчота'", () => {
    const result = parseReminderText("созвонится по поводу отчота", baseTime, timeZone);
    expect(result.description).toBe("Созвониться по поводу отчёта");
  });

  it("should apply T9 autocorrect for 'купит продукты'", () => {
    const result = parseReminderText("купит продукты", baseTime, timeZone);
    expect(result.description).toBe("Купить продукты");
  });

  it("should parse 4-digit time and speech slips: '1130 провести сопрания по уценке бродажей'", () => {
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("1130 провести сопрания по уценке бродажей", nightTime, timeZone);
    expect(result.description).toBe("Провести собрание по уценке продаж");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(11);
    expect(targetParts.minute).toBe(30);
  });

  it("should parse time without 'в': '11:30 провести собрание'", () => {
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("11:30 провести собрание", nightTime, timeZone);
    expect(result.description).toBe("Провести собрание");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(11);
    expect(targetParts.minute).toBe(30);
  });

  it("should parse space-separated time without 'в': '11 30 напомни провести собрание'", () => {
    const nightTime = new Date("2026-10-08T18:08:00.000Z");
    const result = parseReminderText("11 30 напомни провести собрание", nightTime, timeZone);
    expect(result.description).toBe("Провести собрание");
    expect(result.hasExplicitTime).toBe(true);

    const targetParts = getZonedParts(new Date(result.remindAtUtcIso), timeZone);
    expect(targetParts.day).toBe(9);
    expect(targetParts.hour).toBe(11);
    expect(targetParts.minute).toBe(30);
  });
});
