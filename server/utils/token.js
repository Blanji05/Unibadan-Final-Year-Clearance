const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

/** Sign a JWT carrying the identity + role used for route authorisation. */
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, section_code: user.section_code || null },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
