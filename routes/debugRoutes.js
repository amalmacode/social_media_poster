const express = require('express');
const accountController = require('../controllers/accountController');
const { ensureAuthenticated } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/instagram-pages', ensureAuthenticated, accountController.debugInstagramPages);
router.get('/instagram-pages.json', ensureAuthenticated, accountController.debugInstagramPagesJson);

module.exports = router;
