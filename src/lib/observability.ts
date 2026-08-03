/**
 * Minimal observability helpers (Solid Systems: no silent failures).
 * Optional Sentry: set SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN when ready.
 */

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    service: "kittingmaster",
    ...meta,
  };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};

/** Capture unexpected errors for ops (console today; Sentry when DSN set). */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log.error(message, { ...context, stack });

  // Hook point: wire @sentry/nextjs when SENTRY_DSN is configured.
  // Avoid hard dependency so the stack stays portable by default.
  if (process.env.SENTRY_DSN) {
    log.warn("SENTRY_DSN is set but Sentry SDK is not installed; using structured logs only", {
      hint: "npm i @sentry/nextjs and initialize in instrumentation.ts when ready",
    });
  }
}
