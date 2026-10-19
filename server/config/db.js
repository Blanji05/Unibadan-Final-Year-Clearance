/**
 * MySQL connection pool + small query helpers.
 */
const mysql = require('mysql2/promise');
const { config } = require('./env');

const isRemoteDb =
  Boolean(config.db.host) &&
  config.db.host !== 'localhost' &&
  config.db.host !== '127.0.0.1';

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 15,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4_general_ci',
  ...(isRemoteDb ? { ssl: { rejectUnauthorized: false } } : {}),
});

/** Run a query and return the rows. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run a query and return only the first row (or null). */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Run `handler` inside a transaction, rolling back on any thrown error.
 * Used wherever a single logical action touches several tables - e.g.
 * submitting a stage writes clearance_status + submission_documents together.
 */
async function withTransaction(handler) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Verify the database is reachable before the server starts accepting traffic. */
async function assertConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = { pool, query, queryOne, withTransaction, assertConnection };
