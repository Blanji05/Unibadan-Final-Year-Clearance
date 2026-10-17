const multer = require('multer');
const { ApiError } = require('../utils/apiResponse');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Memory storage so the buffer can be forwarded to either Cloudinary or disk
 * without a temp-file step.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new ApiError('Only JPG, PNG, WEBP or PDF files are allowed.', 415));
    }
    cb(null, true);
  },
});

module.exports = { upload };
