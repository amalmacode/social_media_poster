const userModel = require('../models/userModel');

function ensureGuest(req, res, next) {
  if (req.isAuthenticated()) return res.redirect('/');
  return next();
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();

  // --- TEMP (TikTok API review): allow access without login so reviewers aren't
  // redirected to /auth/login. Remove this block once API access is approved to
  // restore the redirect below.
  userModel.findByEmail('test@socialpost.urlyapp.com')
    .then((reviewUser) => {
      if (!reviewUser) {
        req.flash('error', 'Please log in to continue.');
        return res.redirect('/auth/login');
      }
      req.login(reviewUser, (err) => {
        if (err) return next(err);
        return next();
      });
    })
    .catch(next);
  return;
  // --- END TEMP ---

  // req.flash('error', 'Please log in to continue.');
  // return res.redirect('/auth/login');
}

module.exports = { ensureGuest, ensureAuthenticated };
