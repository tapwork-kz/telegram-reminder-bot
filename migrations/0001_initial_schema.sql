-- Initial schema for reminders
CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER NOT NULL,
    telegram_chat_id INTEGER NOT NULL,
    telegram_message_thread_id INTEGER,
    description TEXT NOT NULL,
    original_text TEXT,
    source_type TEXT NOT NULL CHECK(source_type IN ('text', 'voice')),
    remind_at TEXT NOT NULL,
    next_repeat_at TEXT,
    repeat_interval_minutes INTEGER NOT NULL DEFAULT 15,
    status TEXT NOT NULL CHECK(status IN ('scheduled', 'sent', 'snoozed', 'completed', 'irrelevant', 'cancelled')),
    snooze_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    last_sent_at TEXT,
    claim_token TEXT,
    claim_expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reminders_status_remind_at ON reminders (status, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status_next_repeat ON reminders (status, next_repeat_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON reminders (telegram_user_id, status);
