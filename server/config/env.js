/**
 * Central environment configuration.
 *
 * Every optional third-party integration exposes an `enabled` flag. When the
 * credentials are absent the app falls back to a local equivalent (disk
 * storage, simulated payment, console-logged SMS) so the whole clearance flow
 * can still be demonstrated end-to-end without paid accounts.
 */
require('dotenv').config();

const bool = (value) => Boolean(value && String(value).trim());

const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clearance_db',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    get enabled() {
      return bool(this.cloudName) && bool(this.apiKey) && bool(this.apiSecret);
    },
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    get enabled() {
      return bool(this.secretKey);
    },
  },

  remita: {
    merchantId: process.env.REMITA_MERCHANT_ID,
    serviceTypeId: process.env.REMITA_SERVICE_TYPE_ID,
    apiKey: process.env.REMITA_API_KEY,
    // "live" talks to Remita's production environment, "demo" to test.
    env: String(process.env.REMITA_ENV || 'live').toLowerCase() === 'demo' ? 'demo' : 'live',
    get enabled() {
      return bool(this.merchantId) && bool(this.serviceTypeId) && bool(this.apiKey);
    },
  },

  termii: {
    apiKey: process.env.TERMII_API_KEY,
    senderId: process.env.TERMII_SENDER_ID || 'N-Alert',
    get enabled() {
      return bool(this.apiKey);
    },
  },

  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'UI Clearance <no-reply@clearance.ui.edu.ng>',
    get enabled() {
      return bool(this.host) && bool(this.user) && bool(this.pass);
    },
  },

  seedPassword: process.env.SEED_PASSWORD || 'Password123!',
};

/**
 * Fail fast on genuinely required settings rather than producing confusing
 * downstream errors (e.g. jwt.sign throwing on an undefined secret).
 */
function assertRequiredConfig() {
  const problems = [];

  if (!bool(config.jwt.secret)) {
    problems.push('JWT_SECRET is missing. Copy server/.env.example to server/.env and set it.');
  } else if (config.jwt.secret.length < 24) {
    problems.push('JWT_SECRET is too short - use at least 24 characters.');
  }

  if (!bool(config.db.database)) {
    problems.push('DB_NAME is missing.');
  }

  if (problems.length) {
    throw new Error(`Invalid server configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

module.exports = { config, assertRequiredConfig };
