// src/server.js
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const compression = require('compression');
const morgan     = require('morgan');
const cookieParser = require('cookie-parser');
const path       = require('path');
const logger     = require('./config/logger');
const { pool }   = require('./config/database');

// ── Route modules ────────────────────────────────────────────────
const authRoutes     = require('./api/routes/auth');
const focusRoutes    = require('./api/routes/focus');
const podcastRoutes  = require('./api/routes/podcasts');
const aiRoutes       = require('./api/routes/ai');
const contentRoutes  = require('./api/routes/content');

// ── Middleware ───────────────────────────────────────────────────
const { apiLimiter }              = require('./api/middleware/rateLimiter');
const { errorHandler, notFound }  = require('./api/middleware/errorHandler');

const app  = express();
const PORT = parseInt(process.env.PORT || '4000');

// ── Security headers ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for audio streaming
}));

// ── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true, // needed for cookie-based refresh tokens
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing / cookies ───────────────────────────────────────
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());
app.use(compression());

// ── HTTP logging (skip health checks) ───────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: msg => logger.info(msg.trim()) },
    skip:   (req) => req.path === '/health',
  }));
}

// ── Trust proxy (for correct IP behind Nginx/load balancer) ─────
app.set('trust proxy', 1);

// ── Static audio files ───────────────────────────────────────────
// Podcasts served from /public/audio — add auth check if needed
app.use('/audio', express.static(path.join(__dirname, '../public/audio'), {
  maxAge: '7d',
  acceptRanges: true, // required for audio seek
}));

// ── Health check ─────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'db_error' });
  }
});

// ── API routes (general rate limit applied to all) ───────────────
app.use('/api', apiLimiter);
app.use('/api/auth',     authRoutes);
app.use('/api/focus',    focusRoutes);
app.use('/api/podcasts', podcastRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/content',  contentRoutes);

// ── 404 + global error handler ───────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`🔭 Orion backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    logger.info(`   Frontend origin: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    logger.info(`   API: http://localhost:${PORT}/api`);
  });
}

module.exports = app; // for testing
