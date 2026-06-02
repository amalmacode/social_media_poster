function ensureGuest(req, res, next) {
  if (req.isAuthenticated()) return res.redirect('/');
  return next();
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/auth/login');
}

module.exports = { ensureGuest, ensureAuthenticated };
