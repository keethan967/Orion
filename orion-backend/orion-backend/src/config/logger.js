// src/config/logger.js
const { createLogger, format, transports } = require('winston');

const { combine, timestamp, errors, printf, colorize, json } = format;

const devFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), errors({ stack: true })),
  transports: [
    new transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? json()
        : combine(colorize(), devFormat),
    }),
    // In production, you'd add file or remote transport here
  ],
});

module.exports = logger;
