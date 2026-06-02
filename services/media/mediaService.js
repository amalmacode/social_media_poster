const mediaModel = require('../../models/mediaModel');
const { processMedia } = require('./mediaProcessor');
const { relativeUploadPath } = require('../storage/localStorageService');

async function createFromUpload(userId, file) {
  const processed = await processMedia(file);
  return mediaModel.create({
    userId,
    filePath: relativeUploadPath(file.path),
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    duration: processed.duration,
    width: processed.width,
    height: processed.height,
    thumbnailPath: processed.thumbnailPath ? relativeUploadPath(processed.thumbnailPath) : null,
    processingStatus: processed.validationErrors.length ? 'failed' : 'success',
    validationErrors: processed.validationErrors
  });
}

module.exports = { createFromUpload };
