const express = require('express');
const authController = require('../controllers/authController');
const { ensureGuest } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/login', ensureGuest, authController.showLogin);
router.post('/login', ensureGuest, authController.login);
router.get('/register', ensureGuest, authController.showRegister);
router.post('/register', ensureGuest, authController.register);
router.get('/forgot-password', ensureGuest, authController.showForgotPassword);
router.post('/forgot-password', ensureGuest, authController.forgotPassword);
router.post('/logout', authController.logout);

module.exports = router;
