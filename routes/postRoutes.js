const express = require('express');
const postController = require('../controllers/postController');
const { ensureAuthenticated } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.get('/new', ensureAuthenticated, postController.newPost);
router.post('/media', ensureAuthenticated, (req, res, next) => {
  upload.array('media', 10)(req, res, (err) => {
    if (!err) return next();
    // Multer errors — return JSON for XHR requests so the client can show them in-page
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') return next(err);
    let msg = 'Upload failed.';
    if (err.code === 'LIMIT_FILE_SIZE') msg = 'One or more files exceed the 250 MB per-file limit.';
    if (err.code === 'LIMIT_FILE_COUNT') msg = 'Too many files — maximum 10 files per upload.';
    return res.status(413).json({ error: msg });
  });
}, postController.uploadMedia);
router.post('/media/:id/crop', ensureAuthenticated, postController.cropMedia);
router.post('/media/:id/crop-image', ensureAuthenticated, postController.cropImageMedia);
router.patch('/media/:id/folder', ensureAuthenticated, postController.moveMediaToFolder);
router.delete('/media/:id', ensureAuthenticated, postController.deleteMedia);

router.post('/folders', ensureAuthenticated, postController.createFolder);
router.delete('/folders/:id', ensureAuthenticated, postController.deleteFolder);
router.post('/', ensureAuthenticated, postController.createPost);
router.post('/:id/reschedule', ensureAuthenticated, postController.reschedulePost);
router.delete('/:id', ensureAuthenticated, postController.deletePost);

module.exports = router;
