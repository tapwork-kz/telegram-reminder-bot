import { InlineKeyboardMarkup } from "../types";
import { logger } from "../utils/logger";

export interface SendMessageOptions {
  reply_markup?: InlineKeyboardMarkup;
  message_thread_id?: number | null;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
}

export interface EditMessageOptions {
  reply_markup?: InlineKeyboardMarkup | null;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
}

export class TelegramClient {
  private baseUrl: string;

  constructor(private token: string) {
    if (!token) {
      throw new Error("Telegram bot token is not configured");
    }
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async callApi<T>(method: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };

    if (!data.ok) {
      const errText = data.description || "Telegram API call failed";
      logger.error("Telegram API Error", new Error(errText), {
        method,
        error_code: data.error_code,
      });
      throw new Error(`Telegram API [${method}] error: ${errText}`);
    }

    return data.result as T;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<{ message_id: number }> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };

    if (options?.message_thread_id) {
      payload.message_thread_id = options.message_thread_id;
    }
    if (options?.reply_markup) {
      payload.reply_markup = options.reply_markup;
    }
    if (options?.parse_mode) {
      payload.parse_mode = options.parse_mode;
    }

    return await this.callApi<{ message_id: number }>("sendMessage", payload);
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: EditMessageOptions
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        message_id: messageId,
        text,
      };

      if (options?.reply_markup !== undefined) {
        payload.reply_markup = options.reply_markup === null ? { inline_keyboard: [] } : options.reply_markup;
      }
      if (options?.parse_mode) {
        payload.parse_mode = options.parse_mode;
      }

      await this.callApi("editMessageText", payload);
      return true;
    } catch (err: any) {
      // If content was not modified or message was deleted, avoid throwing
      if (err.message && err.message.includes("message is not modified")) {
        return true;
      }
      logger.warn("editMessageText failed", { error: err.message });
      return false;
    }
  }

  async editMessageReplyMarkup(
    chatId: number | string,
    messageId: number,
    replyMarkup?: InlineKeyboardMarkup | null
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: !replyMarkup ? { inline_keyboard: [] } : replyMarkup,
      };
      await this.callApi("editMessageReplyMarkup", payload);
      return true;
    } catch (err: any) {
      if (err.message && err.message.includes("message is not modified")) {
        return true;
      }
      logger.warn("editMessageReplyMarkup failed", { error: err.message });
      return false;
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    try {
      await this.callApi("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
      });
      return true;
    } catch (err: any) {
      logger.warn("answerCallbackQuery failed", { error: err.message });
      return false;
    }
  }

  async getFile(fileId: string): Promise<{ file_path?: string; file_size?: number }> {
    return await this.callApi<{ file_path?: string; file_size?: number }>("getFile", {
      file_id: fileId,
    });
  }

  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to download Telegram file: HTTP ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    const payload: Record<string, unknown> = {
      url,
      allowed_updates: ["message", "callback_query"],
    };
    if (secretToken) {
      payload.secret_token = secretToken;
    }
    return await this.callApi<boolean>("setWebhook", payload);
  }

  async getWebhookInfo(): Promise<any> {
    return await this.callApi<any>("getWebhookInfo");
  }

  async deleteWebhook(): Promise<boolean> {
    return await this.callApi<boolean>("deleteWebhook");
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    try {
      await this.callApi("deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      });
      return true;
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes("message to delete not found") ||
          err.message.includes("message can't be deleted"))
      ) {
        return true;
      }
      logger.warn("deleteMessage failed", {
        error: err.message,
        chat_id: chatId,
        message_id: messageId,
      });
      return false;
    }
  }

  async setMyCommands(
    commands: Array<{ command: string; description: string }>
  ): Promise<boolean> {
    try {
      await this.callApi("setMyCommands", { commands });
      return true;
    } catch (err: any) {
      logger.warn("setMyCommands failed", { error: err.message });
      return false;
    }
  }
}
