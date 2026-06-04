const mediaModel = require('../../models/mediaModel');
const { processMedia } = require('./mediaProcessor');
const { relativeUploadPath } = require('../storage/localStorageService');

async function createFromUpload(userId, file) {
  const processed = await processMedia(file);

  // Use converted file if WebP was auto-converted to JPEG
  const finalPath = processed.convertedPath || file.path;
  const finalMime = processed.convertedMimeType || file.mimetype;
  const finalSize = processed.convertedPath
    ? (await require('fs').promises.stat(finalPath)).size
    : file.size;

  return mediaModel.create({
    userId,
    filePath: relativeUploadPath(finalPath),
    originalName: file.originalname,
    mimeType: finalMime,
    sizeBytes: finalSize,
    duration: processed.duration,
    width: processed.width,
    height: processed.height,
    thumbnailPath: processed.thumbnailPath ? relativeUploadPath(processed.thumbnailPath) : null,
    processingStatus: processed.validationErrors.length ? 'failed' : 'success',
    validationErrors: processed.validationErrors
  });
}

module.exports = { createFromUpload };
