import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
});
