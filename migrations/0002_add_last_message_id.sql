-- Add last_message_id to track notification messages and clean up old inline keyboards
ALTER TABLE reminders ADD COLUMN last_message_id INTEGER;
