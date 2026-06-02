const express = require('express');
const postController = require('../controllers/postController');
const { ensureAuthenticated } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.get('/new', ensureAuthenticated, postController.newPost);
router.post('/media', ensureAuthenticated, upload.array('media', 10), postController.uploadMedia);
router.post('/media/:id/crop', ensureAuthenticated, postController.cropMedia);
router.delete('/media/:id', ensureAuthenticated, postController.deleteMedia);
router.post('/', ensureAuthenticated, postController.createPost);
router.post('/:id/reschedule', ensureAuthenticated, postController.reschedulePost);
router.delete('/:id', ensureAuthenticated, postController.deletePost);

module.exports = router;
