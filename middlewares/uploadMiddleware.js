const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const AppError = require('../utils/AppError');
const { env } = require('../config/env');

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
fs.mkdirSync(env.uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const userDir = path.join(env.uploadRoot, req.user.id);
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024, files: 10 },
  fileFilter(req, file, cb) {
    if (!allowed.has(file.mimetype)) return cb(new AppError('Unsupported media format.', 400));
    cb(null, true);
  }
});

module.exports = { upload };
