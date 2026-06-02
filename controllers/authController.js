const passport = require('passport');
const authService = require('../services/authService');

function showLogin(req, res) {
  res.render('auth/login', { title: 'Log in' });
}

function showRegister(req, res) {
  res.render('auth/register', { title: 'Create account' });
}

async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    req.login(user, (error) => {
      if (error) return next(error);
      req.flash('success', 'Welcome. Your publishing dashboard is ready.');
      return res.redirect('/');
    });
  } catch (error) {
    next(error);
  }
}

const login = passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/auth/login',
  failureFlash: true
});

function logout(req, res, next) {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy(() => res.redirect('/auth/login'));
  });
}

function showForgotPassword(req, res) {
  res.render('auth/forgot', { title: 'Forgot password' });
}

function forgotPassword(req, res) {
  req.flash('success', 'If that email exists, a reset link will be sent. Email delivery is ready to plug into the service layer.');
  res.redirect('/auth/login');
}

module.exports = { showLogin, showRegister, register, login, logout, showForgotPassword, forgotPassword };
