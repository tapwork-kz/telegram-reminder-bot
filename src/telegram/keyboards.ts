import { InlineKeyboardMarkup } from "../types";

/**
 * Main reminder notification keyboard: icons in a single row without text labels.
 * [ ✅ ] [ ⏰ ] [ ❌ ]
 */
export function getReminderActionsKeyboard(reminderId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅", callback_data: `done:${reminderId}` },
        { text: "⏰", callback_data: `snooze:${reminderId}` },
        { text: "❌", callback_data: `irrel:${reminderId}` },
      ],
    ],
  };
}

/**
 * Snooze options keyboard: compact options with back icon.
 */
export function getSnoozeOptionsKeyboard(reminderId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "⏰ 2ч", callback_data: `snz:2h:${reminderId}` },
        { text: "⏰ 4ч", callback_data: `snz:4h:${reminderId}` },
        { text: "🌅 09:00", callback_data: `snz:tom:${reminderId}` },
      ],
      [
        { text: "📅 3д", callback_data: `snz:3d:${reminderId}` },
        { text: "📅 7д", callback_data: `snz:7d:${reminderId}` },
        { text: "🔙", callback_data: `back:${reminderId}` },
      ],
    ],
  };
}

/**
 * Voice confirmation keyboard (icons).
 */
export function getVoiceConfirmKeyboard(actionToken: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅", callback_data: `v_ok:${actionToken}` },
        { text: "❌", callback_data: `v_cancel:${actionToken}` },
      ],
    ],
  };
}
