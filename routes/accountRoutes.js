const express = require('express');
const accountController = require('../controllers/accountController');
const brandAccountController = require('../controllers/brandAccountController');
const { ensureAuthenticated } = require('../middlewares/authMiddleware');
const { watermarkUpload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.get('/', ensureAuthenticated, accountController.index);
router.get('/instagram/connect', ensureAuthenticated, accountController.connectInstagram);
router.get('/instagram/callback', ensureAuthenticated, accountController.instagramCallback);
router.get('/youtube/connect', ensureAuthenticated, accountController.connectYouTube);
router.get('/youtube/callback', ensureAuthenticated, accountController.youtubeCallback);
router.get('/pinterest/connect', ensureAuthenticated, accountController.connectPinterest);
router.get('/pinterest/callback', ensureAuthenticated, accountController.pinterestCallback);
router.get('/pinterest/connect-token', ensureAuthenticated, accountController.connectPinterestToken);
router.post('/pinterest/connect-token', ensureAuthenticated, accountController.pinterestTokenConnect);
router.get('/tiktok/connect', ensureAuthenticated, accountController.connectTikTok);
router.get('/tiktok/callback', ensureAuthenticated, accountController.tiktokCallback);

// Brand accounts
router.post('/brands', ensureAuthenticated, brandAccountController.create);
router.get('/brands/:id', ensureAuthenticated, brandAccountController.show);
router.post('/brands/:id/rename', ensureAuthenticated, brandAccountController.rename);
router.post('/brands/:id/members', ensureAuthenticated, brandAccountController.addMember);
router.delete('/brands/:id/members/:accountId', ensureAuthenticated, brandAccountController.removeMember);
router.delete('/brands/:id', ensureAuthenticated, brandAccountController.remove);
router.post('/brands/:id/watermark', ensureAuthenticated, watermarkUpload.single('watermark'), brandAccountController.uploadWatermark);
router.post('/brands/:id/watermark-settings', ensureAuthenticated, brandAccountController.updateWatermarkSettings);
router.delete('/brands/:id/watermark', ensureAuthenticated, brandAccountController.removeWatermark);

router.delete('/:id', ensureAuthenticated, accountController.disconnect);

module.exports = router;
