function notFound(req, res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

function errorHandler(error, req, res, next) {
  res.locals.currentUser = res.locals.currentUser || req.user || null;
  res.locals.csrfToken = res.locals.csrfToken || '';
  res.locals.flash = res.locals.flash || { success: [], error: [] };

  console.error('Request failed', {
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    message: error.message,
    stack: error.stack
  });
  const status = error.statusCode || 500;
  if (req.accepts('html')) {
    if (typeof req.flash === 'function') {
      req.flash('error', status === 500 ? 'Something went wrong. Please try again.' : error.message);
    }
    return res.status(status).render('errors/error', { title: 'Error', error, status });
  }
  return res.status(status).json({ error: error.message });
}

module.exports = { notFound, errorHandler };
