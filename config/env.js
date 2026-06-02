const path = require('path');

const required = ['SESSION_SECRET', 'DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  sessionSecret: process.env.SESSION_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  uploadRoot: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
  publicMediaBaseUrl: process.env.PUBLIC_MEDIA_BASE_URL || '',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || '',
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
    oauthScopes: (process.env.META_OAUTH_SCOPES || [
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish'
    ].join(','))
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
    instagramLoginScopes: (process.env.META_INSTAGRAM_LOGIN_SCOPES || [
      'instagram_business_basic',
      'instagram_business_content_publish',
      'instagram_business_manage_comments',
      'instagram_business_manage_insights'
    ].join(','))
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  },
  pinterest: {
    clientId: process.env.PINTEREST_CLIENT_ID,
    clientSecret: process.env.PINTEREST_CLIENT_SECRET
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI
  },
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET
  }
};

module.exports = { env };
