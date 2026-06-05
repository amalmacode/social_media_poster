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
  const { rename } = require('fs').promises;
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const tmpPath = path.join(dir, `${base}-crop-${Date.now()}${ext}`);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter(`crop=${w}:${h}:${x}:${y}`)
      .addOption('-c:a', 'copy')
      .on('end', resolve)
      .on('error', reject)
      .save(tmpPath);
  });

  // Atomic replace — rename is a single syscall on the same filesystem,
  // so the original is never left in a partial/corrupt state.
  await rename(tmpPath, inputPath);
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

const OVERLAY_POSITIONS = {
  'center':       '(W-w)/2:(H-h)/2',
  'top-left':     '10:10',
  'top-right':    'W-w-10:10',
  'bottom-left':  '10:H-h-10',
  'bottom-right': 'W-w-10:H-h-10'
};

// Composites a watermark PNG/WebP over any image or video. Returns the temp output path.
// Caller is responsible for deleting the temp file after use.
// mediaWidth: pixel width of the base media (used to compute exact watermark target width).
async function applyWatermark(inputPath, watermarkPath, opacity, position, size, mediaWidth) {
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const tmpPath = path.join(dir, `${base}-wm-${Date.now()}${ext}`);

  const op = Math.min(1, Math.max(0.01, parseFloat(opacity) || 0.5)).toFixed(3);
  const overlayPos = OVERLAY_POSITIONS[position] || OVERLAY_POSITIONS.center;
  const sizePct = Math.min(50, Math.max(5, parseInt(size, 10) || 20));

  // Resolve media width — prefer caller-supplied value, fall back to probing
  let mWidth = parseInt(mediaWidth, 10) || 0;
  if (!mWidth) {
    try {
      const meta = await probe(inputPath);
      const stream = meta.streams.find((s) => s.codec_type === 'video');
      if (stream) mWidth = stream.width || 0;
    } catch { /* ignore — will use scale2ref fallback */ }
  }

  let filter;
  if (mWidth > 0) {
    // Explicit pixel width: plain `scale` filter reliably preserves the watermark's
    // own aspect ratio. scale2ref's h=-2 is ambiguous across ffmpeg versions and
    // can stretch the watermark.  -2 = maintain AR, round to even.
    const targetW = Math.max(10, Math.round(mWidth * sizePct / 100));
    filter = `[1:v]scale=${targetW}:-2,format=argb,colorchannelmixer=aa=${op}[wm];[0:v][wm]overlay=${overlayPos}[outv]`;
  } else {
    // Last-resort fallback when dimensions are completely unknown
    filter = `[1:v][0:v]scale2ref=w=iw*${sizePct}/100:h=-2[wm_s][main];[wm_s]format=argb,colorchannelmixer=aa=${op}[wm];[main][wm]overlay=${overlayPos}[outv]`;
  }

  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(inputPath);

  await new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .input(watermarkPath)
      .complexFilter(filter, ['outv']);
    if (isImage) {
      cmd.outputOptions(['-frames:v', '1', '-q:v', '2']);
    } else {
      cmd.outputOptions(['-map', '0:a?', '-codec:a', 'copy']);
    }
    cmd.on('end', resolve).on('error', reject).save(tmpPath);
  });

  return tmpPath;
}

module.exports = { processMedia, cropVideo, cropImage, applyWatermark, probe, screenshot };
