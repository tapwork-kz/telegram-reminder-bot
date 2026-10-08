export const DEFAULT_TIMEZONE = "Asia/Almaty";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday, 1 = Monday ... 6 = Saturday
}

/**
 * Extracts date parts in a specific timezone using Intl.DateTimeFormat
 */
export function getZonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour === "24" ? "0" : map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

/**
 * Converts a specific calendar datetime in Asia/Almaty (or given timeZone) to UTC ISO string.
 */
export function zonedDateTimeToUtcIso(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number = 0,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  // Asia/Almaty is fixed UTC+5 (offset +05:00)
  // For robustness, calculate exact offset for the given target date using Intl
  const offsetMinutes = getTimezoneOffsetMinutes(new Date(Date.UTC(year, month - 1, day, hour, minute, second)), timeZone);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

/**
 * Calculates timezone offset in minutes for a given instant and timezone
 */
export function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((zonedAsUtc - date.getTime()) / (60 * 1000));
}

/**
 * Get ISO string for tomorrow at specified hour and minute in target timezone
 */
export function getTomorrowAtHourIso(
  hour: number,
  minute: number = 0,
  baseDate: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const current = getZonedParts(baseDate, timeZone);
  // Add 1 day to calendar date
  const tempDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const year = tempDate.getUTCFullYear();
  const month = tempDate.getUTCMonth() + 1;
  const day = tempDate.getUTCDate();

  return zonedDateTimeToUtcIso(year, month, day, hour, minute, 0, timeZone);
}

/**
 * Formats a UTC ISO string for display to user in target timezone (Asia/Almaty) in natural Russian.
 */
export function formatForUser(
  utcIso: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const targetDate = new Date(utcIso);
  const target = getZonedParts(targetDate, timeZone);
  const current = getZonedParts(now, timeZone);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${pad(target.hour)}:${pad(target.minute)}`;

  // Compare calendar days
  const targetDayTimestamp = Date.UTC(target.year, target.month - 1, target.day);
  const currentDayTimestamp = Date.UTC(current.year, current.month - 1, current.day);
  const diffDays = Math.round((targetDayTimestamp - currentDayTimestamp) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return `Сегодня в ${timeStr}`;
  }
  if (diffDays === 1) {
    return `Завтра в ${timeStr}`;
  }
  if (diffDays === 2) {
    return `Послезавтра в ${timeStr}`;
  }

  const monthsRu = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const monthName = monthsRu[target.month - 1];

  if (target.year === current.year) {
    return `${target.day} ${monthName} в ${timeStr}`;
  }
  return `${target.day} ${monthName} ${target.year} г. в ${timeStr}`;
}
