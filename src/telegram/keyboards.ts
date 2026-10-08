import { InlineKeyboardMarkup } from "../types";

/**
 * Main reminder notification keyboard with Done, Snooze, and Irrelevant actions.
 */
export function getReminderActionsKeyboard(reminderId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Выполнено", callback_data: `done:${reminderId}` },
        { text: "⏰ Отложить", callback_data: `snooze:${reminderId}` },
      ],
      [
        { text: "❌ Неактуально", callback_data: `irrel:${reminderId}` },
      ],
    ],
  };
}

/**
 * Snooze options keyboard.
 * Provides 2h, 4h, Tomorrow 09:00, 3 days, 1 week options.
 */
export function getSnoozeOptionsKeyboard(reminderId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "⏰ 2 часа", callback_data: `snz:2h:${reminderId}` },
        { text: "⏰ 4 часа", callback_data: `snz:4h:${reminderId}` },
      ],
      [
        { text: "🌅 Завтра 09:00", callback_data: `snz:tom:${reminderId}` },
      ],
      [
        { text: "📅 3 дня", callback_data: `snz:3d:${reminderId}` },
        { text: "📅 Неделя", callback_data: `snz:7d:${reminderId}` },
      ],
      [
        { text: "« Назад", callback_data: `back:${reminderId}` },
      ],
    ],
  };
}

/**
 * Inline keyboard for voice confirmation if confidence requires explicit confirmation.
 */
export function getVoiceConfirmKeyboard(actionToken: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Создать", callback_data: `v_ok:${actionToken}` },
        { text: "❌ Отмена", callback_data: `v_cancel:${actionToken}` },
      ],
    ],
  };
}
