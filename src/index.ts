import { Env, TelegramUpdate } from "./types";
import { TelegramBot } from "./telegram/bot";
import { RemindersRepository } from "./db/remindersRepository";
import { TelegramClient } from "./telegram/client";
import { ReminderScheduler } from "./reminders/reminderScheduler";
import { logger } from "./utils/logger";

export default {
  /**
   * HTTP Fetch Handler: processes incoming Webhook requests and health checks.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "telegram-reminder-bot",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Telegram Webhook endpoint (Section 31)
    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      // Validate Telegram Webhook Secret Token header if configured
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (receivedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
          logger.warn("Invalid Telegram webhook secret token");
          return new Response("Unauthorized", { status: 401 });
        }
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch (err) {
        logger.error("Failed to parse JSON webhook payload", err);
        return new Response("Bad Request", { status: 400 });
      }

      // Process update immediately
      try {
        const bot = new TelegramBot(env);
        await bot.handleUpdate(update);
      } catch (err) {
        logger.error("Error processing update", err, { update_id: update?.update_id });
      }

      // Proactively process any due reminders in background
      if (env.TELEGRAM_BOT_TOKEN) {
        ctx.waitUntil(
          (async () => {
            try {
              const repo = new RemindersRepository(env.DB);
              const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN!);
              const scheduler = new ReminderScheduler(repo, telegram, env);
              await scheduler.processDueReminders();
            } catch (e) {
              // Ignore background sweep errors
            }
          })()
        );
      }

      return new Response("OK", { status: 200 });
    }

    // Manual Cron Trigger trigger for verification / tests
    if (url.pathname === "/cron/run" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response("TELEGRAM_BOT_TOKEN missing", { status: 500 });
      }
      const repo = new RemindersRepository(env.DB);
      const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      const scheduler = new ReminderScheduler(repo, telegram, env);
      const result = await scheduler.processDueReminders();
      return new Response(JSON.stringify({ status: "done", ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Webhook Setup endpoint
    if (url.pathname === "/telegram/setup-webhook" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response("TELEGRAM_BOT_TOKEN missing", { status: 500 });
      }
      const webhookUrl = `${url.origin}/telegram/webhook`;
      const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      const ok = await telegram.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
      return new Response(JSON.stringify({ success: ok, webhookUrl }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  /**
   * Cloudflare Cron Trigger Handler: runs every minute to process due reminders.
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info("Cron trigger fired", { cron: controller.cron, scheduledTime: controller.scheduledTime });

    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error("TELEGRAM_BOT_TOKEN not configured in Cron handler");
      return;
    }

    const runPromise = (async () => {
      try {
        const repo = new RemindersRepository(env.DB);
        const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN!);
        const scheduler = new ReminderScheduler(repo, telegram, env);

        const result = await scheduler.processDueReminders();
        logger.info("Cron execution completed", {
          processed: result.processedCount,
          success: result.successCount,
          failures: result.failureCount,
        });
      } catch (err) {
        logger.error("Fatal error during Cron execution", err);
      }
    })();

    ctx.waitUntil(runPromise);
    await runPromise;
  },
};
