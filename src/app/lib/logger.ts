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
            format.printf(({ timestamp, level, message }: any) => {
              return `${timestamp} [${level}]: ${message}`;
            })
          )
        : format.json()
    ),
    transports: [new transports.Console()],
  });
} else {
  // Browser fallback
  logger = {
    info: (message: string) => console.info(`[INFO]: ${message}`),
    error: (message: string) => console.error(`[ERROR]: ${message}`),
    warn: (message: string) => console.warn(`[WARN]: ${message}`),
    debug: (message: string) => console.debug(`[DEBUG]: ${message}`),
  };
}

export { logger };
