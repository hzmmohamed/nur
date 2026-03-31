import { LogLayer, ConsoleTransport } from "loglayer"
import { Logger, LogLevel, Layer } from "effect"

// -- LogLayer instance --

export const log = new LogLayer({
  transport: new ConsoleTransport({
    logger: console,
  }),
})

// -- Module-scoped child loggers --

export function createModuleLogger(module: string) {
  return log.child().withContext({ module })
}

// -- Effect Logger bridge --
// Forwards Effect.log/Effect.logDebug/etc. into the loglayer instance

const effectLevelToLogLayer = (level: LogLevel.LogLevel): "trace" | "debug" | "info" | "warn" | "error" | "fatal" => {
  if (LogLevel.greaterThanEqual(level, LogLevel.Fatal)) return "fatal"
  if (LogLevel.greaterThanEqual(level, LogLevel.Error)) return "error"
  if (LogLevel.greaterThanEqual(level, LogLevel.Warning)) return "warn"
  if (LogLevel.greaterThanEqual(level, LogLevel.Info)) return "info"
  if (LogLevel.greaterThanEqual(level, LogLevel.Debug)) return "debug"
  return "trace"
}

export const loglayerEffectLogger = Logger.make(({ logLevel, message }) => {
  const level = effectLevelToLogLayer(logLevel)
  const msg = typeof message === "string" ? message : JSON.stringify(message)

  switch (level) {
    case "trace":
      log.withContext({ source: "effect" }).trace(msg)
      break
    case "debug":
      log.withContext({ source: "effect" }).debug(msg)
      break
    case "info":
      log.withContext({ source: "effect" }).info(msg)
      break
    case "warn":
      log.withContext({ source: "effect" }).warn(msg)
      break
    case "error":
      log.withContext({ source: "effect" }).error(msg)
      break
    case "fatal":
      log.withContext({ source: "effect" }).fatal(msg)
      break
  }
})

export const LoggerLayer: Layer.Layer<never> = Logger.replace(Logger.defaultLogger, loglayerEffectLogger)
