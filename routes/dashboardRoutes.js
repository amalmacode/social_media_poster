const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const postController = require('../controllers/postController');
const { ensureAuthenticated } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', ensureAuthenticated, dashboardController.dashboard);
router.get('/history', ensureAuthenticated, postController.history);
router.get('/scheduled', ensureAuthenticated, postController.scheduled);
router.get('/settings', ensureAuthenticated, (req, res) => res.render('settings/index', { title: 'Settings' }));

module.exports = router;
