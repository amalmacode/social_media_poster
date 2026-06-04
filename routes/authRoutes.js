const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { ensureGuest } = require('../middlewares/authMiddleware');

const router = express.Router();

// Strict limiter: 10 attempts per 15 minutes per IP on auth POST endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many attempts. Please wait 15 minutes and try again.'
});

router.get('/login', ensureGuest, authController.showLogin);
router.post('/login', authLimiter, ensureGuest, authController.login);
router.get('/register', ensureGuest, authController.showRegister);
router.post('/register', authLimiter, ensureGuest, authController.register);
router.get('/forgot-password', ensureGuest, authController.showForgotPassword);
router.post('/forgot-password', ensureGuest, authController.forgotPassword);
router.post('/logout', authController.logout);

module.exports = router;
