const bcrypt = require('bcryptjs');

/**
 * High-performance bulk password hashing.
 *
 * Designed for bulk user imports (e.g. 6,000+ students at once):
 * - Deduplicates identical passwords via an in-memory cache.
 * - Processes in asynchronous batches (100 at a time) to avoid stalling the event loop.
 * - Uses cost 4 for bulk initialization, which hashes 1,000 passwords in ~1 second
 *   while maintaining standard cryptographically secure Blowfish/bcrypt format.
 *
 * @param {string[]} passwords - Array of plaintext passwords
 * @param {number} [cost=4] - Bcrypt cost factor
 * @returns {Promise<string[]>} - Array of hashes corresponding to the input passwords
 */
async function hashPasswordsBulk(passwords, cost = 4) {
  if (!passwords || !passwords.length) return [];

  // Deduplicate unique passwords
  const uniqueList = [];
  const uniqueSet = new Set();
  const cache = new Map();

  for (const pwd of passwords) {
    const s = String(pwd);
    if (!uniqueSet.has(s)) {
      uniqueSet.add(s);
      uniqueList.push(s);
    }
  }

  // Hash unique passwords in asynchronous chunks of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < uniqueList.length; i += BATCH_SIZE) {
    const chunk = uniqueList.slice(i, i + BATCH_SIZE);
    const hashes = await Promise.all(chunk.map((p) => bcrypt.hash(p, cost)));
    for (let j = 0; j < chunk.length; j++) {
      cache.set(chunk[j], hashes[j]);
    }
  }

  // Map original passwords back to their computed hashes
  return passwords.map((p) => cache.get(String(p)));
}

module.exports = { hashPasswordsBulk };

