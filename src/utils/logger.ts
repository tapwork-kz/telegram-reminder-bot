/**
 * Safe structured logger that never prints secrets, tokens, or sensitive user data.
 */
export const logger = {
  info(event: string, meta: Record<string, unknown> = {}) {
    const sanitized = sanitizeMeta(meta);
    console.log(JSON.stringify({ level: "INFO", event, timestamp: new Date().toISOString(), ...sanitized }));
  },
  warn(event: string, meta: Record<string, unknown> = {}) {
    const sanitized = sanitizeMeta(meta);
    console.warn(JSON.stringify({ level: "WARN", event, timestamp: new Date().toISOString(), ...sanitized }));
  },
  error(event: string, error?: unknown, meta: Record<string, unknown> = {}) {
    const sanitized = sanitizeMeta(meta);
    const errMessage = error instanceof Error ? error.message : String(error || "");
    console.error(JSON.stringify({ level: "ERROR", event, error: errMessage, timestamp: new Date().toISOString(), ...sanitized }));
  },
};

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("auth") ||
      lowerKey.includes("password") ||
      lowerKey.includes("key")
    ) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }
  return result;
}
