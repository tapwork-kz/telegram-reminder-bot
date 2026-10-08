import { Env } from "./types";

export const DEFAULT_TIMEZONE = "Asia/Almaty";
export const DEFAULT_REMIND_DELAY_MINUTES = 30;
export const DEFAULT_REPEAT_MINUTES = 15;

export function getTimezone(env: Env): string {
  return env.TIMEZONE || DEFAULT_TIMEZONE;
}

export function getDefaultReminderMinutes(env: Env): number {
  return parseInt(env.DEFAULT_REMINDER_MINUTES || "", 10) || DEFAULT_REMIND_DELAY_MINUTES;
}

export function getRepeatIntervalMinutes(env: Env): number {
  return parseInt(env.REPEAT_INTERVAL_MINUTES || "", 10) || DEFAULT_REPEAT_MINUTES;
}

export function isUserAllowed(userId: number, env: Env): boolean {
  const allowed = env.ALLOWED_TELEGRAM_USER_ID?.trim();
  if (!allowed || allowed === "*") {
    // If whitelist is not configured yet, allow the user and log/display info
    return true;
  }
  const allowedIds = allowed
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowedIds.includes(String(userId));
}
