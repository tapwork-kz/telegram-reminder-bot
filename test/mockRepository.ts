import { Reminder, ReminderStatus, ReminderSource } from "../src/types";
import { CreateReminderParams } from "../src/db/remindersRepository";

export class MockRemindersRepository {
  public reminders: Map<number, Reminder> = new Map();
  private nextId = 1;

  async create(params: CreateReminderParams): Promise<Reminder> {
    const nowIso = new Date().toISOString();
    const id = this.nextId++;
    const reminder: Reminder = {
      id,
      telegram_user_id: params.telegram_user_id,
      telegram_chat_id: params.telegram_chat_id,
      telegram_message_thread_id: params.telegram_message_thread_id,
      description: params.description,
      original_text: params.original_text,
      source_type: params.source_type,
      remind_at: params.remind_at,
      next_repeat_at: null,
      repeat_interval_minutes: params.repeat_interval_minutes || 15,
      status: "scheduled",
      snooze_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.reminders.set(id, reminder);
    return reminder;
  }

  async getById(id: number): Promise<Reminder | null> {
    return this.reminders.get(id) || null;
  }

  async claimDueReminders(
    nowIso: string,
    claimToken: string,
    claimExpiresIso: string,
    limit: number = 25
  ): Promise<Reminder[]> {
    const claimed: Reminder[] = [];
    const nowTime = new Date(nowIso).getTime();

    for (const reminder of this.reminders.values()) {
      if (claimed.length >= limit) break;

      const isEligibleStatus =
        reminder.status === "scheduled" ||
        reminder.status === "snoozed" ||
        reminder.status === "sent";

      if (!isEligibleStatus) continue;

      const remindAtTime = new Date(reminder.remind_at).getTime();
      const repeatAtTime = reminder.next_repeat_at ? new Date(reminder.next_repeat_at).getTime() : null;

      const isDue =
        (reminder.status !== "sent" && remindAtTime <= nowTime) ||
        (reminder.status === "sent" && repeatAtTime !== null && repeatAtTime <= nowTime);

      if (!isDue) continue;

      // Check lock / claim
      const claimExpiresTime = reminder.claim_expires_at ? new Date(reminder.claim_expires_at).getTime() : 0;
      const isFree = !reminder.claim_token || claimExpiresTime < nowTime;

      if (isFree) {
        reminder.claim_token = claimToken;
        reminder.claim_expires_at = claimExpiresIso;
        reminder.updated_at = nowIso;
        claimed.push({ ...reminder });
      }
    }

    return claimed;
  }

  async recordSentNotification(
    id: number,
    nextRepeatIso: string,
    lastMessageId?: number | null
  ): Promise<void> {
    const reminder = this.reminders.get(id);
    if (!reminder) return;
    const nowIso = new Date().toISOString();
    reminder.status = "sent";
    reminder.last_sent_at = nowIso;
    reminder.next_repeat_at = nextRepeatIso;
    if (lastMessageId !== undefined) {
      reminder.last_message_id = lastMessageId;
    }
    reminder.updated_at = nowIso;
    reminder.claim_token = null;
    reminder.claim_expires_at = null;
  }

  async markCancelled(id: number): Promise<void> {
    const reminder = this.reminders.get(id);
    if (!reminder) return;
    const nowIso = new Date().toISOString();
    reminder.status = "cancelled";
    reminder.updated_at = nowIso;
    reminder.claim_token = null;
    reminder.claim_expires_at = null;
  }

  async releaseClaim(id: number): Promise<void> {
    const reminder = this.reminders.get(id);
    if (!reminder) return;
    reminder.claim_token = null;
    reminder.claim_expires_at = null;
  }

  async markCompleted(id: number): Promise<Reminder | null> {
    const reminder = this.reminders.get(id);
    if (!reminder) return null;
    const nowIso = new Date().toISOString();
    reminder.status = "completed";
    reminder.completed_at = nowIso;
    reminder.next_repeat_at = null;
    reminder.claim_token = null;
    reminder.claim_expires_at = null;
    reminder.updated_at = nowIso;
    return reminder;
  }

  async markIrrelevant(id: number): Promise<Reminder | null> {
    const reminder = this.reminders.get(id);
    if (!reminder) return null;
    const nowIso = new Date().toISOString();
    reminder.status = "irrelevant";
    reminder.next_repeat_at = null;
    reminder.claim_token = null;
    reminder.claim_expires_at = null;
    reminder.updated_at = nowIso;
    return reminder;
  }

  async snooze(id: number, newRemindAtIso: string): Promise<Reminder | null> {
    const reminder = this.reminders.get(id);
    if (!reminder) return null;
    const nowIso = new Date().toISOString();
    reminder.status = "snoozed";
    reminder.remind_at = newRemindAtIso;
    reminder.next_repeat_at = newRemindAtIso;
    reminder.snooze_count += 1;
    reminder.claim_token = null;
    reminder.claim_expires_at = null;
    reminder.updated_at = nowIso;
    return reminder;
  }

  async getActiveForUser(userId: number): Promise<Reminder[]> {
    return Array.from(this.reminders.values()).filter(
      (r) =>
        r.telegram_user_id === userId &&
        (r.status === "scheduled" || r.status === "snoozed" || r.status === "sent")
    );
  }
}
