const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');

const { env } = require('./config/env');
const { pool } = require('./config/db');
require('./config/passport');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const postRoutes = require('./routes/postRoutes');
const accountRoutes = require('./routes/accountRoutes');
const debugRoutes = require('./routes/debugRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const legalRoutes = require('./routes/legalRoutes');
const mediaPublicRoutes = require('./routes/mediaPublicRoutes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

// Trust Cloudflare Tunnel / reverse proxy so X-Forwarded-For is used correctly
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'cdn.tailwindcss.com', 'static.cloudflareinsights.com', "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      'font-src': ["'self'", 'fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', env.appUrl]
    }
  }
}));
// Static assets before rate limiter — no need to rate-limit CSS/JS/images
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 500 }));

// Prevent Cloudflare (and any proxy) from caching dynamic HTML responses
app.use((req, res, next) => {
  if (!req.path.startsWith('/public') && !req.path.startsWith('/uploads')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));

app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Uploaded media — served only to the authenticated owner (must be after passport)
app.use('/uploads', (req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).end();
  const urlPath = decodeURIComponent(req.path).replace(/\\/g, '/');
  if (!urlPath.startsWith(`/${req.user.id}/`)) return res.status(403).end();
  next();
}, express.static(path.join(__dirname, env.uploadDir)));

app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.csrfToken = '';
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error')
  };
  next();
});

const csrfProtection = csrf();
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  if (req.path === '/data-deletion/callback') return next();
  return csrfProtection(req, res, next);
});

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

app.use('/', mediaPublicRoutes);
app.use('/', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/posts', postRoutes);
app.use('/accounts', accountRoutes);
if (!env.isProduction) app.use('/debug', debugRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/', legalRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
