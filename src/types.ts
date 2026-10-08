export type ReminderStatus =
  | "scheduled"
  | "sent"
  | "snoozed"
  | "completed"
  | "irrelevant"
  | "cancelled";

export type ReminderSource = "text" | "voice";

export interface Reminder {
  id: number;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_message_thread_id?: number | null;
  description: string;
  original_text?: string | null;
  source_type: ReminderSource;
  remind_at: string; // ISO 8601 in UTC
  next_repeat_at?: string | null; // ISO 8601 in UTC
  repeat_interval_minutes: number;
  status: ReminderStatus;
  snooze_count: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  last_sent_at?: string | null;
  last_message_id?: number | null;
  claim_token?: string | null;
  claim_expires_at?: string | null;
}

export interface ParseResult {
  description: string;
  remindAtUtcIso: string;
  hasExplicitTime: boolean;
  rawTimeText?: string;
  isPast?: boolean;
}

export interface Env {
  DB: D1Database;
  AI?: any; // Cloudflare Workers AI binding
  TELEGRAM_BOT_TOKEN?: string;
  ALLOWED_TELEGRAM_USER_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  STT_API_KEY?: string;
  AI_API_KEY?: string;
  TIMEZONE?: string;
  DEFAULT_REMINDER_MINUTES?: string;
  REPEAT_INTERVAL_MINUTES?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  message_thread_id?: number;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
