import { Reminder, ReminderStatus, ReminderSource } from "../types";

export interface CreateReminderParams {
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_message_thread_id?: number | null;
  description: string;
  original_text?: string | null;
  source_type: ReminderSource;
  remind_at: string; // ISO string
  repeat_interval_minutes?: number;
}

export class RemindersRepository {
  constructor(private db: D1Database) {}

  async create(params: CreateReminderParams): Promise<Reminder> {
    const nowIso = new Date().toISOString();
    const repeatInterval = params.repeat_interval_minutes ?? 15;

    const query = `
      INSERT INTO reminders (
        telegram_user_id,
        telegram_chat_id,
        telegram_message_thread_id,
        description,
        original_text,
        source_type,
        remind_at,
        repeat_interval_minutes,
        status,
        snooze_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 0, ?, ?)
      RETURNING *;
    `;

    const res = await this.db
      .prepare(query)
      .bind(
        params.telegram_user_id,
        params.telegram_chat_id,
        params.telegram_message_thread_id ?? null,
        params.description,
        params.original_text ?? null,
        params.source_type,
        params.remind_at,
        repeatInterval,
        nowIso,
        nowIso
      )
      .first<Reminder>();

    if (!res) {
      throw new Error("Failed to insert reminder into D1");
    }
    return res;
  }

  async getById(id: number): Promise<Reminder | null> {
    const res = await this.db
      .prepare("SELECT * FROM reminders WHERE id = ?")
      .bind(id)
      .first<Reminder>();
    return res ?? null;
  }

  async getActiveForUser(userId: number, limit: number = 20): Promise<Reminder[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM reminders
         WHERE telegram_user_id = ?
           AND status IN ('scheduled', 'sent', 'snoozed')
         ORDER BY remind_at ASC
         LIMIT ?`
      )
      .bind(userId, limit)
      .all<Reminder>();

    return results || [];
  }

  /**
   * Atomically claims due reminders to prevent duplicate sends across concurrent cron executions.
   */
  async claimDueReminders(
    nowIso: string,
    claimToken: string,
    claimExpiresIso: string,
    limit: number = 25
  ): Promise<Reminder[]> {
    // 1. Mark batch with unique claimToken if not already claimed
    await this.db
      .prepare(
        `UPDATE reminders
         SET claim_token = ?, claim_expires_at = ?, updated_at = ?
         WHERE id IN (
           SELECT id FROM reminders
           WHERE status IN ('scheduled', 'sent', 'snoozed')
             AND (
               (status IN ('scheduled', 'snoozed') AND remind_at <= ?)
               OR (status = 'sent' AND next_repeat_at IS NOT NULL AND next_repeat_at <= ?)
             )
             AND (claim_token IS NULL OR claim_expires_at < ?)
           ORDER BY remind_at ASC
           LIMIT ?
         )`
      )
      .bind(claimToken, claimExpiresIso, nowIso, nowIso, nowIso, nowIso, limit)
      .run();

    // 2. Fetch the reminders that were successfully claimed by this worker
    const { results } = await this.db
      .prepare("SELECT * FROM reminders WHERE claim_token = ?")
      .bind(claimToken)
      .all<Reminder>();

    return results || [];
  }

  /**
   * Update reminder state after sending notification to user.
   */
  async recordSentNotification(id: number, nextRepeatIso: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE reminders
         SET status = 'sent',
             last_sent_at = ?,
             next_repeat_at = ?,
             updated_at = ?,
             claim_token = NULL,
             claim_expires_at = NULL
         WHERE id = ?`
      )
      .bind(nowIso, nextRepeatIso, nowIso, id)
      .run();
  }

  /**
   * Release claim in case of temporary failure so it can be retried cleanly.
   */
  async releaseClaim(id: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE reminders
         SET claim_token = NULL, claim_expires_at = NULL
         WHERE id = ?`
      )
      .bind(id)
      .run();
  }

  /**
   * User marks reminder as completed.
   */
  async markCompleted(id: number): Promise<Reminder | null> {
    const nowIso = new Date().toISOString();
    return await this.db
      .prepare(
        `UPDATE reminders
         SET status = 'completed',
             completed_at = ?,
             updated_at = ?,
             next_repeat_at = NULL,
             claim_token = NULL,
             claim_expires_at = NULL
         WHERE id = ?
         RETURNING *`
      )
      .bind(nowIso, nowIso, id)
      .first<Reminder>();
  }

  /**
   * User marks reminder as irrelevant.
   */
  async markIrrelevant(id: number): Promise<Reminder | null> {
    const nowIso = new Date().toISOString();
    return await this.db
      .prepare(
        `UPDATE reminders
         SET status = 'irrelevant',
             updated_at = ?,
             next_repeat_at = NULL,
             claim_token = NULL,
             claim_expires_at = NULL
         WHERE id = ?
         RETURNING *`
      )
      .bind(nowIso, id)
      .first<Reminder>();
  }

  /**
   * User snoozes reminder to a new target time.
   */
  async snooze(id: number, newRemindAtIso: string): Promise<Reminder | null> {
    const nowIso = new Date().toISOString();
    return await this.db
      .prepare(
        `UPDATE reminders
         SET status = 'snoozed',
             remind_at = ?,
             next_repeat_at = ?,
             snooze_count = snooze_count + 1,
             updated_at = ?,
             claim_token = NULL,
             claim_expires_at = NULL
         WHERE id = ?
         RETURNING *`
      )
      .bind(newRemindAtIso, newRemindAtIso, nowIso, id)
      .first<Reminder>();
  }

  /**
   * Cancels reminder.
   */
  async cancel(id: number): Promise<Reminder | null> {
    const nowIso = new Date().toISOString();
    return await this.db
      .prepare(
        `UPDATE reminders
         SET status = 'cancelled',
             updated_at = ?,
             next_repeat_at = NULL,
             claim_token = NULL,
             claim_expires_at = NULL
         WHERE id = ?
         RETURNING *`
      )
      .bind(nowIso, id)
      .first<Reminder>();
  }
}
