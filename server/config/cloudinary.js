/**
 * File storage with a local-disk fallback.
 *
 * When Cloudinary credentials are present uploads go to Cloudinary. Otherwise
 * files are written to server/uploads and served statically, so the upload
 * flow can be demonstrated without a Cloudinary account.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { config } = require('./env');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

let cloudinary = null;
if (config.cloudinary.enabled) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

const isRemote = () => Boolean(cloudinary);

/**
 * Persist an uploaded buffer.
 * @returns {Promise<{url: string, publicId: string|null}>}
 */
async function storeFile(file, studentId) {
  if (cloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `clearance/${studentId}`, resource_type: 'auto' },
        (error, uploaded) => (error ? reject(error) : resolve(uploaded))
      );
      stream.end(file.buffer);
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.originalname) || '';
  const name = `${studentId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), file.buffer);

  // Relative URL - the client prefixes it with the API origin.
  return { url: `/uploads/${name}`, publicId: null };
}

/** Remove a previously stored file. Best-effort: never throws. */
async function removeFile({ storage_public_id, file_url }) {
  try {
    if (cloudinary && storage_public_id) {
      await cloudinary.uploader.destroy(storage_public_id);
      return;
    }
    if (!cloudinary && file_url && file_url.startsWith('/uploads/')) {
      await fs.unlink(path.join(UPLOAD_DIR, path.basename(file_url)));
    }
  } catch (error) {
    console.warn('[storage] could not delete file:', error.message);
  }
}

module.exports = { storeFile, removeFile, isRemote, UPLOAD_DIR };
