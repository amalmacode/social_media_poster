const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

function configureFfmpeg() {
  const ffmpegPath = process.env.FFMPEG_PATH || safeRequirePath('ffmpeg-static');
  const ffprobePath = process.env.FFPROBE_PATH || safeRequirePath('ffprobe-static')?.path;

  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);
}

function safeRequirePath(packageName) {
  try {
    return require(packageName);
  } catch (error) {
    return null;
  }
}

configureFfmpeg();

function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => (error ? reject(error) : resolve(metadata)));
  });
}

function screenshot(filePath, outputDir) {
  return new Promise((resolve, reject) => {
    const filename = `${path.basename(filePath, path.extname(filePath))}-thumb.jpg`;
    ffmpeg(filePath)
      .on('end', () => resolve(path.join(outputDir, filename)))
      .on('error', reject)
      .screenshots({ timestamps: ['10%'], filename, folder: outputDir, size: '720x?' });
  });
}

async function convertWebpToJpeg(filePath) {
  const { unlink } = require('fs').promises;
  const jpgPath = filePath.replace(/\.webp$/i, '.jpg');
  await new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions('-q:v', '2')
      .on('end', resolve)
      .on('error', reject)
      .save(jpgPath);
  });
  try { await unlink(filePath); } catch { /* ignore */ }
  return jpgPath;
}

async function processMedia(file) {
  if (file.mimetype.startsWith('image/')) {
    let filePath = file.path;
    let mimeType = file.mimetype;

    if (mimeType === 'image/webp') {
      filePath = await convertWebpToJpeg(filePath);
      mimeType = 'image/jpeg';
    }

    // Probe dimensions — ffprobe treats images as single-frame video streams
    let width = null, height = null;
    try {
      const meta = await probe(filePath);
      const stream = meta.streams.find((s) => s.codec_type === 'video');
      if (stream) { width = stream.width || null; height = stream.height || null; }
    } catch { /* non-critical — dimensions can be fetched at crop time */ }

    return {
      duration: null,
      width,
      height,
      thumbnailPath: filePath,
      convertedPath: filePath !== file.path ? filePath : null,
      convertedMimeType: mimeType !== file.mimetype ? mimeType : null,
      validationErrors: []
    };
  }

  const metadata = await probe(file.path);
  const video = metadata.streams.find((stream) => stream.codec_type === 'video');
  const duration = metadata.format.duration || null;
  const validationErrors = [];
  let thumbnailPath = null;

  if (video) {
    const width = video.width || null;
    const height = video.height || null;
    if (duration && duration > 180) validationErrors.push('Video is longer than the MVP 3 minute limit.');
    if (width && height && height < width) validationErrors.push('Vertical or square media works best for reels, shorts, and pins.');
    thumbnailPath = await screenshot(file.path, path.dirname(file.path));
    return { duration, width, height, thumbnailPath, validationErrors };
  }

  return { duration, width: null, height: null, thumbnailPath, validationErrors };
}

// Crops a video in-place. x, y, w, h are natural pixel coordinates.
async function cropVideo(inputPath, x, y, w, h) {
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  // Unique tmp name so concurrent/retry calls never collide on Windows.
  const tmpPath = path.join(dir, `${base}-crop-${Date.now()}${ext}`);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter(`crop=${w}:${h}:${x}:${y}`)
      .addOption('-c:a', 'copy')
      .on('end', resolve)
      .on('error', reject)
      .save(tmpPath);
  });

  // On Windows, FFmpeg may not have fully released its file handle when `end`
  // fires — retry copyFile with back-off for EBUSY.
  const { copyFile, unlink } = require('fs').promises;
  let lastErr;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    try {
      await copyFile(tmpPath, inputPath);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (err.code !== 'EBUSY') break;
    }
  }
  if (lastErr) throw lastErr;

  // Temp cleanup is best-effort — a locked file here is not fatal.
  try { await unlink(tmpPath); } catch { /* ignore */ }
}

// Crops an image in-place using ffmpeg. x, y, w, h are natural pixel coordinates.
async function cropImage(inputPath, x, y, w, h) {
  const { copyFile, unlink } = require('fs').promises;
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const tmpPath = path.join(dir, `${base}-imgcrop-${Date.now()}${ext}`);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter(`crop=${w}:${h}:${x}:${y}`)
      .outputOptions(['-frames:v', '1', '-q:v', '2'])
      .on('end', resolve)
      .on('error', reject)
      .save(tmpPath);
  });

  await copyFile(tmpPath, inputPath);
  try { await unlink(tmpPath); } catch { /* ignore */ }
}

module.exports = { processMedia, cropVideo, cropImage, probe, screenshot };
