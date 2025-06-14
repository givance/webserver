// Custom logger that works in both server and browser environments
const isDevelopment = process.env.NODE_ENV === "development";
const isServer = typeof window === "undefined";

let logger: any;

if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createLogger, format, transports } = require("winston");

  logger = createLogger({
    level: isDevelopment ? "debug" : "info",
    format: format.combine(
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      isDevelopment
        ? format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, ...meta }: any) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          )
        : format.json()
    ),
    transports: [new transports.Console()],
  });
} else {
  // Browser fallback
  logger = {
    info: (message: string, meta?: any) => {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.info(`[INFO]: ${message}${metaStr}`);
    },
    error: (message: string, meta?: any) => {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.error(`[ERROR]: ${message}${metaStr}`);
    },
    warn: (message: string, meta?: any) => {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.warn(`[WARN]: ${message}${metaStr}`);
    },
    debug: (message: string, meta?: any) => {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.debug(`[DEBUG]: ${message}${metaStr}`);
    },
  };
}

export { logger };
