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

app.use(cors({ origin: config.clientOrigin, credentials: true }));
// Larger limit: the admin's student CSV import posts the file contents as JSON (supporting 6,000+ students).
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Serve locally-stored uploads and generated certificates when the remote
// providers are not configured.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/generated', express.static(path.join(__dirname, 'generated')));

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

app.get('/api/realtime/stream', handleSseConnection);
app.get('/api/system/academic-structure', (req, res) => {
  res.json({ success: true, data: { faculties: ACADEMIC_STRUCTURE } });
});

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/officer', officerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    assertRequiredConfig();
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  try {
    await assertConnection();
    console.log(`[db] connected to ${config.db.database}@${config.db.host}:${config.db.port}`);
  } catch (error) {
    console.error(`\n[db] Could not connect to MySQL: ${error.message}`);
    console.error('     Check that MySQL is running and server/.env is correct.');
    console.error('     Then run:  npm run db:init\n');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    console.log(`[server] CORS origin: ${config.clientOrigin}`);
    if (!isRemote()) console.log('[storage] Cloudinary not configured - using local disk (server/uploads)');
    if (!config.paystack.enabled) console.log('[payments] Paystack not configured - payments are simulated');
    if (!config.termii.enabled) console.log('[sms] Termii not configured - messages are logged to console');
    if (!config.mail.enabled) console.log('[email] SMTP not configured - emails are logged to console');
  });

  // A stale server from a previous run is the usual cause here, so say that
  // plainly instead of dumping an unhandled 'error' event stack trace.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n[server] Port ${config.port} is already in use.`);
      console.error('     Another instance is probably still running. Either stop it:');
      console.error(`       netstat -ano | findstr :${config.port}     (find the PID)`);
      console.error('       taskkill /F /PID <pid>');
      console.error(`     ...or set a different PORT in server/.env\n`);
      process.exit(1);
    }
    console.error(`\n[server] failed to start: ${error.message}\n`);
    process.exit(1);
  });
}

start();

module.exports = app;
