import { ParseResult } from "../types";
import {
  DEFAULT_TIMEZONE,
  getZonedParts,
  zonedDateTimeToUtcIso,
} from "../utils/dates";

/**
 * Normalizes speech recognition text, fixing phonetic errors, time formatting, and fillers.
 */
export function cleanAndNormalizeText(raw: string): string {
  let text = raw.trim();
  if (!text) return "";

  // 1. Normalize time separators: 11-30 -> 11:30, 11—30 -> 11:30
  text = text.replace(/(\d{1,2})[-—](\d{2})/g, "$1:$2");

  // 2. Normalize 4-digit time: "1130" or "в 1130" -> "11:30" or "в 11:30"
  text = text.replace(/(^|[^а-яёa-z0-9])(?:(в)\s+)?([01]\d|2[0-3])([0-5]\d)(?=[^а-яёa-z0-9]|$)(?!\s*(?:год|г\b))/gi, (match, prefix, v, h, m) => {
    const vPrefix = v ? "в " : "";
    return `${prefix}${vPrefix}${h}:${m} `;
  });

  // 3. Normalize "в 11 30" or "11 30" -> "в 11:30" or "11:30"
  text = text.replace(/(^|[^а-яёa-z0-9])(?:(в)\s+)?([01]?\d|2[0-3])\s+([0-5]\d)(?=[^а-яёa-z0-9]|$)(?!\s*(?:год|г\b))/gi, (match, prefix, v, h, m) => {
    const vPrefix = v ? "в " : "";
    return `${prefix}${vPrefix}${h}:${m} `;
  });

  // 4. T9 / Phonetic speech corrections for common reminder actions
  text = text.replace(/(?:^|[^а-яёa-z0-9])созвонится(?=[^а-яёa-z0-9]|$)/gi, " созвониться ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])встретится(?=[^а-яёa-z0-9]|$)/gi, " встретиться ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])увидимся(?=[^а-яёa-z0-9]|$)/gi, " увидеться ");

  text = text.replace(/(?:^|[^а-яёa-z0-9])купит(?=[^а-яёa-z0-9]|$)/gi, " купить ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])позвонит(?=[^а-яёa-z0-9]|$)/gi, " позвонить ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])отправит(?=[^а-яёa-z0-9]|$)/gi, " отправить ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])забрат(?=[^а-яёa-z0-9]|$)/gi, " забрать ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])сделат(?=[^а-яёa-z0-9]|$)/gi, " сделать ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])проверит(?=[^а-яёa-z0-9]|$)/gi, " проверить ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])написат(?=[^а-яёa-z0-9]|$)/gi, " написать ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])оплатит(?=[^а-яёa-z0-9]|$)/gi, " оплатить ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])подготовит(?=[^а-яёa-z0-9]|$)/gi, " подготовить ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])согласоват(?=[^а-яёa-z0-9]|$)/gi, " согласовать ");

  // Phonetic fixes for "провести собрание" and variations
  text = text.replace(/(?:^|[^а-яёa-z0-9])(?:провесли|приессе|правести)(?=[^а-яёa-z0-9]|$)/gi, " провести ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])с\s*обрань[яе]м?(?=[^а-яёa-z0-9]|$)/gi, " собрание ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])собрань[яе](?=[^а-яёa-z0-9]|$)/gi, " собрание ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])собрания(?=[^а-яёa-z0-9]|$)/gi, " собрание ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])сопрани[яе](?=[^а-яёa-z0-9]|$)/gi, " собрание ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])сопрони(?=[^а-яёa-z0-9]|$)/gi, " собрание ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])соурание[м]?(?=[^а-яёa-z0-9]|$)/gi, " собрание ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])сопрани([а-я]*)(?=[^а-яёa-z0-9]|$)/gi, " собрани$1 ");

  // Business terms
  text = text.replace(/(?:^|[^а-яёa-z0-9])бродажей(?=[^а-яёa-z0-9]|$)/gi, " продаж ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])бродаж([а-я]*)(?=[^а-яёa-z0-9]|$)/gi, " продаж$1 ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])отчот([а-я]*)(?=[^а-яёa-z0-9]|$)/gi, " отчёт$1 ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])планерк([а-я]*)(?=[^а-яёa-z0-9]|$)/gi, " планёрк$1 ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])докумет([а-я]*)(?=[^а-яёa-z0-9]|$)/gi, " документ$1 ");
  text = text.replace(/(?:^|[^а-яёa-z0-9])сб(?=[^а-яёa-z0-9]|$)/gi, " СБ ");

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Parses user reminder text in Russian, extracting the description and the target remind_at timestamp.
 * Time calculations are anchored in the provided timezone (default Asia/Almaty).
 */
export function parseReminderText(
  text: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
  defaultMinutes: number = 30
): ParseResult {
  const normalized = cleanAndNormalizeText(text);
  if (!normalized) {
    return {
      description: "",
      remindAtUtcIso: new Date(now.getTime() + defaultMinutes * 60000).toISOString(),
      hasExplicitTime: false,
    };
  }

  const lower = normalized.toLowerCase();
  const localNow = getZonedParts(now, timeZone);

  let targetDate: Date | null = null;
  let rawTimeMatch = "";
  let matchedIndex = -1;
  let matchedLength = 0;

  function parseTimeOfDay(timeFragment: string): { hour: number; minute: number } | null {
    // Supports 11:30, 11.30, 11-30, 11 30
    const hhmmMatch = timeFragment.match(/(\d{1,2})[:.\-—\s](\d{2})/);
    if (hhmmMatch) {
      let h = parseInt(hhmmMatch[1], 10);
      const m = parseInt(hhmmMatch[2], 10);
      if (timeFragment.includes("вечера") && h < 12) h += 12;
      return { hour: h, minute: m };
    }
    const hOnlyMatch = timeFragment.match(/(\d{1,2})(?:\s*(?:часов|часа|час))?(?:\s*(утра|вечера|дня|ночи))?/);
    if (hOnlyMatch) {
      let h = parseInt(hOnlyMatch[1], 10);
      const modifier = hOnlyMatch[2];
      if (modifier === "вечера" && h < 12) h += 12;
      if (modifier === "ночи" && h === 12) h = 0;
      if (modifier === "дня" && h < 12 && h >= 1 && h <= 5) h += 12;
      return { hour: h, minute: 0 };
    }
    if (timeFragment.includes("утром") || timeFragment.includes("утра")) {
      return { hour: 9, minute: 0 };
    }
    if (timeFragment.includes("вечером") || timeFragment.includes("вечера")) {
      return { hour: 19, minute: 0 };
    }
    if (timeFragment.includes("днем") || timeFragment.includes("днём")) {
      return { hour: 14, minute: 0 };
    }
    return null;
  }

  // Pattern 1: через N минут / часов / дней / недель
  const relRegex = /(?:^|\s)(через\s+(?:(\d+|полтора|полчаса|один|два|три|четыре|пять)\s+)?(минут[уы]?|мин|час(?:а|ов)?|дн(?:я|ей)|день|недел(?:ю|и|ь)))(?=$|\s|[.,!?;])/i;
  const relMatch = lower.match(relRegex);

  if (relMatch && relMatch.index !== undefined) {
    const fullMatch = relMatch[0];
    const leadingSpaces = fullMatch.length - fullMatch.trimStart().length;
    matchedIndex = relMatch.index + leadingSpaces;
    rawTimeMatch = relMatch[1];
    matchedLength = rawTimeMatch.length;

    const numStr = relMatch[2];
    const unit = relMatch[3].toLowerCase();

    let amount = 1;
    if (numStr) {
      if (numStr === "полтора") amount = 1.5;
      else if (numStr === "полчаса") amount = 0.5;
      else if (numStr === "один") amount = 1;
      else if (numStr === "два") amount = 2;
      else if (numStr === "три") amount = 3;
      else if (numStr === "четыре") amount = 4;
      else if (numStr === "пять") amount = 5;
      else amount = parseFloat(numStr) || 1;
    }

    if (unit.startsWith("мин")) {
      targetDate = new Date(now.getTime() + Math.round(amount * 60) * 1000);
    } else if (unit.startsWith("час")) {
      targetDate = new Date(now.getTime() + Math.round(amount * 3600) * 1000);
    } else if (unit.startsWith("дн") || unit === "день") {
      targetDate = new Date(now.getTime() + Math.round(amount * 86400) * 1000);
    } else if (unit.startsWith("недел")) {
      targetDate = new Date(now.getTime() + Math.round(amount * 7 * 86400) * 1000);
    }
  }

  // Pattern 2: (завтра | послезавтра | сегодня) [в HH:MM / в N утра / вечером / ...]
  if (!targetDate) {
    const dayRegex = /(?:^|\s)((завтра|послезавтра|сегодня)(?:\s+(?:в\s+)?(\d{1,2}\s*(?:утра|вечера|дня|ночи)|[0-9]{1,2}(?:[:.\-—\s][0-9]{2})?|утром|вечером|днём|днем))?)(?=$|\s|[.,!?;])/i;
    const dayMatch = lower.match(dayRegex);

    if (dayMatch && dayMatch.index !== undefined) {
      const fullMatch = dayMatch[0];
      const leadingSpaces = fullMatch.length - fullMatch.trimStart().length;
      matchedIndex = dayMatch.index + leadingSpaces;
      rawTimeMatch = dayMatch[1];
      matchedLength = rawTimeMatch.length;

      const dayKeyword = dayMatch[2].toLowerCase();
      const timePartStr = dayMatch[3];

      let daysToAdd = 0;
      if (dayKeyword === "завтра") daysToAdd = 1;
      else if (dayKeyword === "послезавтра") daysToAdd = 2;

      let hour = 9;
      let minute = 0;

      if (timePartStr) {
        const parsedT = parseTimeOfDay(timePartStr);
        if (parsedT) {
          hour = parsedT.hour;
          minute = parsedT.minute;
        }
      } else if (dayKeyword === "сегодня") {
        hour = localNow.hour;
        minute = localNow.minute + defaultMinutes;
      }

      const baseCalDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + daysToAdd));
      const targetUtcIso = zonedDateTimeToUtcIso(
        baseCalDate.getUTCFullYear(),
        baseCalDate.getUTCMonth() + 1,
        baseCalDate.getUTCDate(),
        hour,
        minute,
        0,
        timeZone
      );
      targetDate = new Date(targetUtcIso);
    }
  }

  // Pattern 3: Дни недели: "в пятницу", "в субботу", "в понедельник в 18:00"
  if (!targetDate) {
    const weekdayMap: Record<string, number> = {
      понедельник: 1,
      вторник: 2,
      среду: 3,
      четверг: 4,
      пятницу: 5,
      субботу: 6,
      воскресенье: 0,
    };
    const wdRegex = /(?:^|\s)(в(?:о)?\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?:\s+(?:в\s+)?(\d{1,2}\s*(?:утра|вечера|дня|ночи)|[0-9]{1,2}(?:[:.\-—\s][0-9]{2})?|утром|вечером|днём|днем))?)(?=$|\s|[.,!?;])/i;
    const wdMatch = lower.match(wdRegex);

    if (wdMatch && wdMatch.index !== undefined) {
      const fullMatch = wdMatch[0];
      const leadingSpaces = fullMatch.length - fullMatch.trimStart().length;
      matchedIndex = wdMatch.index + leadingSpaces;
      rawTimeMatch = wdMatch[1];
      matchedLength = rawTimeMatch.length;

      const targetWd = weekdayMap[wdMatch[2].toLowerCase()];
      const timePartStr = wdMatch[3];

      let daysAhead = targetWd - localNow.weekday;
      if (daysAhead <= 0) {
        daysAhead += 7;
      }

      let hour = 9;
      let minute = 0;
      if (timePartStr) {
        const parsedT = parseTimeOfDay(timePartStr);
        if (parsedT) {
          hour = parsedT.hour;
          minute = parsedT.minute;
        }
      }

      const baseCalDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + daysAhead));
      const targetUtcIso = zonedDateTimeToUtcIso(
        baseCalDate.getUTCFullYear(),
        baseCalDate.getUTCMonth() + 1,
        baseCalDate.getUTCDate(),
        hour,
        minute,
        0,
        timeZone
      );
      targetDate = new Date(targetUtcIso);
    }
  }

  // Pattern 4: "в 11:30", "11:30", "в 18:00", "18:00", "в 10 утра"
  if (!targetDate) {
    const timeOnlyRegex = /(?:^|\s)((?:в\s+)?([0-9]{1,2}[:.\-—\s][0-9]{2}(?:\s*(?:утра|вечера|дня|ночи))?|\d{1,2}\s*(?:утра|вечера|дня|ночи)))(?=$|\s|[.,!?;])/i;
    const timeOnlyMatch = lower.match(timeOnlyRegex);

    if (timeOnlyMatch && timeOnlyMatch.index !== undefined) {
      const fullMatch = timeOnlyMatch[0];
      const leadingSpaces = fullMatch.length - fullMatch.trimStart().length;
      matchedIndex = timeOnlyMatch.index + leadingSpaces;
      rawTimeMatch = timeOnlyMatch[1];
      matchedLength = rawTimeMatch.length;

      const parsedT = parseTimeOfDay(timeOnlyMatch[2]);
      if (parsedT) {
        let dayOffset = 0;
        // If specified time has already passed today, schedule for TOMORROW
        if (
          parsedT.hour < localNow.hour ||
          (parsedT.hour === localNow.hour && parsedT.minute <= localNow.minute)
        ) {
          dayOffset = 1;
        }

        const baseCalDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + dayOffset));
        const targetUtcIso = zonedDateTimeToUtcIso(
          baseCalDate.getUTCFullYear(),
          baseCalDate.getUTCMonth() + 1,
          baseCalDate.getUTCDate(),
          parsedT.hour,
          parsedT.minute,
          0,
          timeZone
        );
        targetDate = new Date(targetUtcIso);
      }
    }
  }

  // Clean description from text
  let description = normalized;
  let hasExplicitTime = false;

  if (targetDate && matchedIndex !== -1) {
    hasExplicitTime = true;
    const before = normalized.substring(0, matchedIndex);
    const after = normalized.substring(matchedIndex + matchedLength);
    description = `${before} ${after}`.trim();
  } else {
    targetDate = new Date(now.getTime() + defaultMinutes * 60000);
    hasExplicitTime = false;
  }

  // Clean trigger words anywhere in sentence
  description = description
    .replace(/(?:^|[^а-яёa-z0-9])(?:поставь|поставьте|сделай|сделайте|добавь|добавьте|установи|установите|создай|создайте)\s+(?:мне\s+)?(?:напоминани[ея]|задачу)(?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])(?:нужно|надо)\s+напомни(?:ть|те)?(?:\s+мне)?(?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])напоминани[ея](?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])напомни(?:те)?(?:\s+мне)?(?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])напомнить(?:\s+мне)?(?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])не\s+забудь(?:те)?(?:\s+мне)?(?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])пожалуйста(?=[^а-яёa-z0-9]|$)/gi, " ")
    .replace(/(?:^|[^а-яёa-z0-9])плиз(?=[^а-яёa-z0-9]|$)/gi, " ");

  // Strip dangling punctuation and conjunctions
  description = description
    .replace(/^[.,;:\s!?—–-]+/, "")
    .replace(/[.,;:\s!?—–-]+$/, "")
    .trim();

  description = description
    .replace(/^(?:что|чтобы|о|об|про|в|на|через|к|мне)\s+/i, "")
    .replace(/\s+(?:в|на|через|к)$/i, "")
    .trim();

  description = description
    .replace(/^[.,;:\s!?—–-]+/, "")
    .replace(/[.,;:\s!?—–-]+$/, "")
    .trim();

  if (!description) {
    description = normalized;
  }

  // Capitalize first character
  description = description.charAt(0).toUpperCase() + description.slice(1);

  const isPast = targetDate.getTime() < now.getTime() - 1000;

  return {
    description,
    remindAtUtcIso: targetDate.toISOString(),
    hasExplicitTime,
    rawTimeText: rawTimeMatch,
    isPast,
  };
}

/**
 * Extracts reminder description from a bot message text.
 * Bot messages usually have format:
 * "🔔 Напоминание создано\n<description>\n⏰ <time>"
 * or "🔔 Напоминание\n<description>\n⏰ <time>"
 * or "✏️ Дополнено:\n<description>\n⏰ <time>"
 */
export function extractDescriptionFromBotMessage(text: string): string | null {
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (
      line.startsWith("🔔") ||
      line.startsWith("✏️") ||
      line.startsWith("⏰") ||
      line.startsWith("✅") ||
      line.startsWith("❌") ||
      line.startsWith("🎤") ||
      line.startsWith("👋") ||
      line.startsWith("⚠️")
    ) {
      continue;
    }
    bodyLines.push(line);
  }

  if (bodyLines.length > 0) {
    return bodyLines.join(" ").trim();
  }
  return null;
}

