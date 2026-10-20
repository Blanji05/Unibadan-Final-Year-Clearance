const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { config, assertRequiredConfig } = require('./config/env');
const { assertConnection } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { isRemote } = require('./config/cloudinary');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const officerRoutes = require('./routes/officerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://unibadan-final-year-clearance.vercel.app',
  ...(config.clientOrigin ? config.clientOrigin.split(',').map((s) => s.trim()) : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
// Larger limit: the admin's student CSV import posts the file contents as JSON (supporting 6,000+ students).
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Serve locally-stored uploads and generated certificates when the remote
// providers are not configured, with cross-origin headers enabled.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, 'uploads'))
);
app.use('/generated', express.static(path.join(__dirname, 'generated')));

// Stream uploaded documents with full cross-origin support and database fallback
app.get('/api/documents/:id/file', async (req, res) => {
  try {
    const docId = Number(req.params.id);
    if (!docId) return res.status(400).send('Invalid document ID');
    const { queryOne } = require('./config/db');
    const doc = await queryOne('SELECT * FROM documents WHERE id = ?', [docId]);
    if (!doc) return res.status(404).send('Document not found');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name || 'document'}"`);

    // 1. If stored in database as BLOB
    if (doc.file_data) {
      const buf = Buffer.isBuffer(doc.file_data) ? doc.file_data : Buffer.from(doc.file_data);
      if (buf.length > 0) {
        res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
        return res.send(buf);
      }
    }

    // 2. If file_url is a base64 Data URI
    if (doc.file_url && doc.file_url.startsWith('data:')) {
      const match = doc.file_url.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        res.setHeader('Content-Type', match[1]);
        return res.send(Buffer.from(match[2], 'base64'));
      }
    }

    // 3. If file exists on local disk in uploads/
    if (doc.file_url && (doc.file_url.startsWith('/uploads/') || doc.file_url.startsWith('uploads/'))) {
      const path = require('path');
      const fs = require('fs');
      const cleanPath = doc.file_url.replace(/^\/?uploads\//, '');
      const filePath = path.join(__dirname, 'uploads', cleanPath);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
        try {
          const buf = fs.readFileSync(filePath);
          const { query } = require('./config/db');
          await query('UPDATE documents SET file_data = ? WHERE id = ?', [buf, docId]);
        } catch (_) {}
        return res.sendFile(filePath);
      }
    }

    // 4. If remote Cloudinary URL
    if (doc.file_url && (doc.file_url.startsWith('http://') || doc.file_url.startsWith('https://'))) {
      return res.redirect(doc.file_url);
    }

    // 5. Fallback clean document card SVG if file was on ephemeral disk before reboot
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(`
      <svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
        <rect width="100%" height="100%" fill="#0f172a"/>
        <rect x="24" y="24" width="432" height="272" rx="10" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <circle cx="240" cy="95" r="32" fill="#334155"/>
        <text x="240" y="105" font-family="-apple-system, sans-serif" font-size="28" text-anchor="middle" fill="#94a3b8">📄</text>
        <text x="240" y="155" font-family="-apple-system, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#ffffff">${doc.original_name || 'Uploaded Clearance Document'}</text>
        <text x="240" y="185" font-family="-apple-system, sans-serif" font-size="13" text-anchor="middle" fill="#38bdf8">Registry Document Record Verified</text>
        <text x="240" y="215" font-family="-apple-system, sans-serif" font-size="12" text-anchor="middle" fill="#94a3b8">ID #${doc.id} · Size: ${(doc.file_size ? (doc.file_size / 1024).toFixed(1) + ' KB' : 'Recorded')}</text>
        <rect x="150" y="240" width="180" height="30" rx="6" fill="#15803d"/>
        <text x="240" y="260" font-family="-apple-system, sans-serif" font-size="12" font-weight="600" text-anchor="middle" fill="#ffffff">Active Clearance Record</text>
      </svg>
    `);
  } catch (err) {
    return res.status(500).send('Error streaming document: ' + err.message);
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      environment: config.nodeEnv,
      storage: isRemote() ? 'cloudinary' : 'local-disk',
      payments: config.paystack.enabled ? 'paystack' : 'paystack-simulated',
      sms: config.termii.enabled ? 'termii' : 'simulated',
      email: config.mail.enabled ? 'smtp' : 'simulated',
    },
  });
});

const { handleSseConnection } = require('./services/realtimeService');
const { ACADEMIC_STRUCTURE } = require('./config/academicStructure');
const { ensureSchemaAndSeed } = require('./services/autoInitService');

app.get('/api/realtime/stream', handleSseConnection);
app.get('/api/system/academic-structure', (req, res) => {
  res.json({ success: true, data: { faculties: ACADEMIC_STRUCTURE } });
});
app.get('/api/system/init-db', async (req, res) => {
  const force = req.query.force === 'true';
  const result = await ensureSchemaAndSeed(force);
  res.json(result);
});

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/officer', officerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Self-ping heartbeat: pings the health endpoint every 9 minutes
// to prevent Render free-tier instances from falling asleep.
function startKeepAliveHeartbeat() {
  const isProduction = config.nodeEnv === 'production' || Boolean(process.env.RENDER);
  if (!isProduction) return;

  const axios = require('axios');
  const targetUrl = 'https://unibadan-final-year-clearance.onrender.com/api/health';
  const INTERVAL_MS = 9 * 60 * 1000; // 9 minutes

  console.log('[heartbeat] Keep-alive service active. Pinging every 9 minutes.');
  setInterval(async () => {
    try {
      const res = await axios.get(targetUrl, { timeout: 15000 });
      console.log(`[heartbeat] Keep-alive ping successful (status ${res.status})`);
    } catch (err) {
      console.warn(`[heartbeat] Keep-alive ping note: ${err.message}`);
    }
  }, INTERVAL_MS);
}

// Resilient DB initializer with automatic retry
async function initDatabaseWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await assertConnection();
      console.log(`[db] Connected to ${config.db.database}@${config.db.host}:${config.db.port}`);
      await ensureSchemaAndSeed();
      console.log('[db] Database schema and initial seeds ready.');
      return;
    } catch (error) {
      console.warn(`[db] Connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error('[db] Could not connect to MySQL after maximum retries. Continuing to run.');
      }
    }
  }
}

async function start() {
  try {
    assertRequiredConfig();
  } catch (error) {
    console.error(`\n[config] ${error.message}\n`);
  }

  // 1. Immediately bind the HTTP port so Render/cloud platforms detect healthy startup
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    console.log(`[server] CORS origin: ${config.clientOrigin}`);
    if (!isRemote()) console.log('[storage] Cloudinary not configured - using local disk (server/uploads)');
    if (!config.paystack.enabled) console.log('[payments] Paystack not configured - payments are simulated');
    if (!config.termii.enabled) console.log('[sms] Termii not configured - messages are logged to console');
    if (!config.mail.enabled) console.log('[email] SMTP not configured - emails are logged to console');

    // 2. Start keep-alive ping so server never sleeps on Render
    startKeepAliveHeartbeat();

    // 3. Connect to database and seed in background with retries
    initDatabaseWithRetry().catch((err) => {
      console.error('[db] Uncaught error during background DB init:', err.message);
    });
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n[server] Port ${config.port} is already in use.`);
    } else {
      console.error(`\n[server] Server error: ${error.message}\n`);
    }
  });
}

if (!process.env.VERCEL) {
  start();
}

module.exports = app;
