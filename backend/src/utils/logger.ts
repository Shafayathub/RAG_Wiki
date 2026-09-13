export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isLogLevel(value: string): value is LogLevel {
  return value in LEVEL_WEIGHT;
}

const configuredLevel = ((): LogLevel => {
  const raw = (process.env["LOG_LEVEL"] ?? "").toLowerCase();
  if (isLogLevel(raw)) return raw;
  return process.env["NODE_ENV"] === "test" ? "error" : "info";
})();

const threshold = LEVEL_WEIGHT[configuredLevel];
const humanReadable = process.env["NODE_ENV"] !== "production";

export type LogFields = Record<string, unknown>;

/**
 * Errors are not JSON-serialisable by default — `JSON.stringify(new Error())`
 * yields `{}`. Unpack the parts worth keeping and drop stacks in production
 * so internal paths never reach a log aggregator we do not control.
 */
function serialiseError(value: unknown): LogFields {
  if (!(value instanceof Error)) return { error: value };

  return {
    error: {
      name: value.name,
      message: value.message,
      ...(humanReadable ? { stack: value.stack } : {}),
    },
  };
}

function emit(level: LogLevel, message: string, fields: LogFields): void {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const entry = { level, time: new Date().toISOString(), message, ...fields };
  const line = humanReadable
    ? `${entry.time} ${level.toUpperCase().padEnd(5)} ${message}${
        Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : ""
      }`
    : JSON.stringify(entry);

  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, error?: unknown, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function build(bindings: LogFields): Logger {
  return {
    debug: (message, fields) => emit("debug", message, { ...bindings, ...fields }),
    info: (message, fields) => emit("info", message, { ...bindings, ...fields }),
    warn: (message, fields) => emit("warn", message, { ...bindings, ...fields }),
    error: (message, error, fields) =>
      emit("error", message, {
        ...bindings,
        ...fields,
        ...(error === undefined ? {} : serialiseError(error)),
      }),
    child: (extra) => build({ ...bindings, ...extra }),
  };
}

export const logger: Logger = build({});
