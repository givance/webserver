import pino from "pino";

// Create a logger that works in both server and edge environments
export const logger = pino({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  // Only use transport in development and when not in edge runtime
  transport:
    process.env.NODE_ENV === "development" && typeof window === "undefined" && !process.env.NEXT_RUNTIME
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
  // Ensure base config works in all environments
  base: process.env.NODE_ENV === "development" ? undefined : null,
});
