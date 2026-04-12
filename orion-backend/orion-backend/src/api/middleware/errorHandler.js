// src/api/middleware/errorHandler.js
const logger = require('../../config/logger');

/**
 * Central error handler.
 * Must be registered LAST in Express middleware chain.
 */
function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  const status  = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'An internal error occurred';

  if (status >= 500) {
    logger.error(`[Error] ${req.method} ${req.path} — ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`[Warn] ${req.method} ${req.path} — ${err.message}`);
  }

  res.status(status).json({
    error:   message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

/**
 * 404 handler — registered before errorHandler.
 */
function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
