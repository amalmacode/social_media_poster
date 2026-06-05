const crypto = require('crypto');
const accountModel = require('../models/accountModel');
const brandAccountModel = require('../models/brandAccountModel');
const instagramService = require('../services/platforms/instagramService');
const pinterestService = require('../services/platforms/pinterestService');
const youtubeService = require('../services/platforms/youtubeService');
const tiktokService = require('../services/platforms/tiktokService');
const { env } = require('../config/env');

async function index(req, res, next) {
  try {
    const [accounts, brandAccounts] = await Promise.all([
      accountModel.listByUser(req.user.id),
      brandAccountModel.listByUser(req.user.id)
    ]);
    res.render('accounts/index', { title: 'Connected accounts', accounts, brandAccounts });
  } catch (error) {
    next(error);
  }
}

function connectInstagram(req, res) {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const redirectUri = `${env.appUrl}/accounts/instagram/callback`;
  const url = new URL(`https://www.facebook.com/${env.meta.graphVersion}/dialog/oauth`);
  url.searchParams.set('client_id', env.meta.appId || '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', env.meta.oauthScopes.join(','));
  url.searchParams.set('auth_type', 'rerequest');
  url.searchParams.set('return_scopes', 'true');
  res.redirect(url.toString());
}

function connectInstagramDirect(req, res) {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.instagramLoginOAuthState = state;
  const redirectUri = `${env.appUrl}/accounts/instagram-login/callback`;
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', env.meta.appId || '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', env.meta.instagramLoginScopes.join(','));
  url.searchParams.set('state', state);
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_authentication', '1');
  res.redirect(url.toString());
}

async function instagramLoginCallback(req, res, next) {
  try {
    if (!req.query.state || req.query.state !== req.session.instagramLoginOAuthState) throw new Error('Invalid Instagram Login OAuth state.');
    const redirectUri = `${env.appUrl}/accounts/instagram-login/callback`;
    const token = await instagramService.exchangeInstagramLoginCode({ code: req.query.code, redirectUri });
    const profile = await instagramService.getInstagramLoginProfile(token.access_token);
    const platformUserId = String(profile?.user_id || token.user_id);
    const username = profile?.username || platformUserId;

    // token.permissions is an array returned by Instagram Login e.g. ['instagram_business_basic', ...]
    const grantedScopes = Array.isArray(token.permissions)
      ? token.permissions
      : String(token.scope || '').split(',').map((s) => s.trim()).filter(Boolean);
    const requiredForPublishing = ['instagram_business_content_publish'];
    const missingPublishing = requiredForPublishing.filter((s) => !grantedScopes.includes(s));

    await accountModel.upsert({
      userId: req.user.id,
      platform: 'instagram',
      platformUserId,
      username,
      accessToken: token.access_token,
      refreshToken: null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      metadata: {
        authFlow: 'instagram_login',
        requestedScopes: env.meta.instagramLoginScopes,
        grantedScopes,
        tokenResponse: { ...token, access_token: '[redacted]' },
        profile
      }
    });

    if (missingPublishing.length) {
      req.flash('error', `Instagram connected (@${username}) but missing permission(s): ${missingPublishing.join(', ')}. Publishing will fail — reconnect and approve all permissions.`);
    } else {
      req.flash('success', `Instagram account connected: ${username}`);
    }
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

async function instagramCallback(req, res, next) {
  try {
    if (!req.query.state || req.query.state !== req.session.oauthState) throw new Error('Invalid OAuth state.');
    console.log('Meta OAuth callback scope response', JSON.stringify({
      granted_scopes: req.query.granted_scopes || null,
      denied_scopes: req.query.denied_scopes || null
    }, null, 2));

    const token = await instagramService.exchangeCode({ code: req.query.code, redirectUri: `${env.appUrl}/accounts/instagram/callback` });
    req.session.instagramDebugAccessToken = token.access_token;
    req.session.instagramDebugToken = {
      token_type: token.token_type || null,
      expires_in: token.expires_in || null,
      expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null
    };

    const tokenDiagnostics = await instagramService.getTokenDiagnostics(token.access_token);
    instagramService.logTokenDiagnostics(tokenDiagnostics);

    if (tokenDiagnostics.missingScopes.length) {
      req.flash('error', `Meta did not grant required permission(s): ${tokenDiagnostics.missingScopes.join(', ')}. Reconnect and approve every requested permission, or enable those permissions in the Meta app use-case/app review settings.`);
      return res.redirect('/accounts');
    }

    if (tokenDiagnostics.missingFuturePublishingScopes.length) {
      req.flash('error', `Connected but missing publishing permission(s): ${tokenDiagnostics.missingFuturePublishingScopes.join(', ')}. Posts to this account will fail. Disconnect, reconnect, and approve every permission when prompted.`);
    }

    const businesses = await instagramService.getBusinesses(token.access_token);
    const pageDiagnostics = await instagramService.diagnosePages(token.access_token);
    const accounts = pageDiagnostics.pages
      .filter((page) => page.instagram_business_account)
      .map((page) => {
        const sourcePage = (pageDiagnostics.pagesRawResponse.data || []).find((item) => item.id === page.page_id);
        return {
          platformUserId: page.instagram_business_account.id,
          username: page.instagram_business_account.username || page.page_name,
          accessToken: sourcePage?.access_token,
          metadata: {
            pageId: page.page_id,
            pageName: page.page_name,
            instagramLookupRawResponse: page.raw_response
          }
        };
      });

    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;

    for (const account of accounts) {
      // Instagram Business Account
      await accountModel.upsert({
        userId: req.user.id,
        platform: 'instagram',
        platformUserId: account.platformUserId,
        username: account.username,
        accessToken: account.accessToken,
        expiresAt,
        metadata: { ...account.metadata, businesses }
      });

      // Facebook Page linked to this Instagram account
      await accountModel.upsert({
        userId: req.user.id,
        platform: 'facebook',
        platformUserId: account.metadata.pageId,
        username: account.metadata.pageName,
        accessToken: account.accessToken,
        expiresAt,
        metadata: { pageId: account.metadata.pageId, pageName: account.metadata.pageName, linkedInstagramId: account.platformUserId, businesses }
      });
    }

    if (accounts.length) {
      req.flash('success', `Instagram & Facebook Page connected.`);
    } else {
      req.session.instagramPageDiagnostics = pageDiagnostics.pages;
      req.flash('error', 'No Instagram Professional account was found linked to a Facebook Page. Check /debug/instagram-pages for details.');
    }
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

async function debugInstagramPages(req, res, next) {
  try {
    const accessToken = req.session.instagramDebugAccessToken;
    if (!accessToken) {
      return res.status(400).json({
        error: 'No recent Meta OAuth token is available in this session. Re-run Connect Instagram, then open /debug/instagram-pages.'
      });
    }

    const tokenDiagnostics = await instagramService.getTokenDiagnostics(accessToken);
    instagramService.logTokenDiagnostics(tokenDiagnostics);
    const pageDiagnostics = await instagramService.diagnosePages(accessToken);

    if (req.query.format === 'json') {
      return res.json({
        token: req.session.instagramDebugToken || null,
        token_diagnostics: tokenDiagnostics,
        pages_raw_response: pageDiagnostics.pagesRawResponse,
        pages: pageDiagnostics.pages
      });
    }

    return res.render('debug/instagramPages', {
      title: 'Instagram Page Diagnostics',
      token: req.session.instagramDebugToken || null,
      tokenDiagnostics,
      pagesRawResponse: pageDiagnostics.pagesRawResponse,
      pages: pageDiagnostics.pages
    });
  } catch (error) {
    next(error);
  }
}

async function debugInstagramPagesJson(req, res, next) {
  try {
    const accessToken = req.session.instagramDebugAccessToken;
    if (!accessToken) {
      return res.status(400).json({
        error: 'No recent Meta OAuth token is available in this session. Re-run Connect Instagram, then open /debug/instagram-pages.'
      });
    }

    const tokenDiagnostics = await instagramService.getTokenDiagnostics(accessToken);
    const pageDiagnostics = await instagramService.diagnosePages(accessToken);
    return res.json({
      token: req.session.instagramDebugToken || null,
      token_diagnostics: tokenDiagnostics,
      pages_raw_response: pageDiagnostics.pagesRawResponse,
      pages: pageDiagnostics.pages
    });
  } catch (error) { next(error); }
}

function connectYouTube(req, res) {
  if (!env.google.clientId || !env.google.clientSecret) {
    req.flash('error', 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
    return res.redirect('/accounts');
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.youtubeOAuthState = state;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.google.clientId);
  url.searchParams.set('redirect_uri', `${env.appUrl}/accounts/youtube/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly'
  ].join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}

async function youtubeCallback(req, res, next) {
  try {
    if (!req.query.state || req.query.state !== req.session.youtubeOAuthState) throw new Error('Invalid OAuth state.');
    const redirectUri = `${env.appUrl}/accounts/youtube/callback`;
    const token = await youtubeService.exchangeCode({ code: req.query.code, redirectUri });
    let channel;
    try {
      channel = await youtubeService.getChannel(token.access_token);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        req.flash('error', 'This Google account does not have access to the YouTube API. Make sure the account has a YouTube channel at youtube.com and that it is not a restricted Google Workspace account.');
      } else {
        req.flash('error', `Could not retrieve YouTube channel: ${err.message}`);
      }
      return res.redirect('/accounts');
    }
    if (!channel) {
      req.flash('error', 'This Google account has no YouTube channel. Go to youtube.com and create a channel first, then reconnect.');
      return res.redirect('/accounts');
    }
    await accountModel.upsert({
      userId: req.user.id,
      platform: 'youtube',
      platformUserId: channel.id,
      username: channel.snippet.title,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      metadata: { channelId: channel.id, channelTitle: channel.snippet.title }
    });

    const grantedYt = String(token.scope || '').split(' ').filter(Boolean);
    const missingYt = ['https://www.googleapis.com/auth/youtube.upload']
      .filter((s) => !grantedYt.includes(s));
    if (missingYt.length) {
      req.flash('error', `YouTube connected (${channel.snippet.title}) but youtube.upload permission was not granted — video publishing will fail. Disconnect and reconnect, approving all permissions.`);
    } else {
      req.flash('success', `YouTube connected: ${channel.snippet.title}`);
    }
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

function connectPinterest(req, res) {
  if (!env.pinterest.clientId || !env.pinterest.clientSecret) {
    req.flash('error', 'Set PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET in .env first.');
    return res.redirect('/accounts');
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.pinterestOAuthState = state;
  const url = new URL('https://www.pinterest.com/oauth/');
  url.searchParams.set('client_id', env.pinterest.clientId);
  url.searchParams.set('redirect_uri', `${env.appUrl}/accounts/pinterest/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'boards:read,pins:write,user_accounts:read');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}

async function pinterestCallback(req, res, next) {
  try {
    if (!req.query.state || req.query.state !== req.session.pinterestOAuthState) throw new Error('Invalid OAuth state.');
    const redirectUri = `${env.appUrl}/accounts/pinterest/callback`;
    const token = await pinterestService.exchangeCode({ code: req.query.code, redirectUri });
    const [profile, boards] = await Promise.all([
      pinterestService.getProfile(token.access_token),
      pinterestService.getBoards(token.access_token)
    ]);
    await accountModel.upsert({
      userId: req.user.id,
      platform: 'pinterest',
      platformUserId: profile.username,
      username: profile.username,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      metadata: { boards, profile }
    });
    req.flash('success', `Pinterest connected: @${profile.username} — ${boards.length} board(s) loaded.`);
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

function connectPinterestToken(req, res) {
  res.render('accounts/pinterest-token', { title: 'Connect Pinterest with token' });
}

async function pinterestTokenConnect(req, res, next) {
  try {
    const accessToken = (req.body.accessToken || '').trim();
    if (!accessToken) {
      req.flash('error', 'Paste your Pinterest access token.');
      return res.redirect('/accounts/pinterest/connect-token');
    }
    const [profile, boards] = await Promise.all([
      pinterestService.getProfile(accessToken),
      pinterestService.getBoards(accessToken)
    ]);
    if (!profile?.username) throw new Error('Pinterest API returned no profile — token may be invalid or expired.');
    await accountModel.upsert({
      userId: req.user.id,
      platform: 'pinterest',
      platformUserId: profile.username,
      username: profile.username,
      accessToken,
      refreshToken: null,
      expiresAt: null,
      metadata: { boards: (boards || []).map((b) => ({ id: b.id, name: b.name })), profile, sandbox: true }
    });
    req.flash('success', `Pinterest connected: @${profile.username} — ${(boards || []).length} board(s) loaded.`);
    res.redirect('/accounts');
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    req.flash('error', `Pinterest token error: ${msg}`);
    res.redirect('/accounts/pinterest/connect-token');
  }
}

function connectTikTok(req, res) {
  if (!env.tiktok.clientKey || !env.tiktok.clientSecret) {
    req.flash('error', 'Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env first.');
    return res.redirect('/accounts');
  }
  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  req.session.tiktokOAuthState = state;
  req.session.tiktokCodeVerifier = codeVerifier;
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', env.tiktok.clientKey);
  url.searchParams.set('redirect_uri', `${env.appUrl}/accounts/tiktok/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'user.info.basic,video.publish');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  res.redirect(url.toString());
}

async function tiktokCallback(req, res, next) {
  try {
    if (!req.query.state || req.query.state !== req.session.tiktokOAuthState) throw new Error('Invalid OAuth state.');
    const redirectUri = `${env.appUrl}/accounts/tiktok/callback`;
    const codeVerifier = req.session.tiktokCodeVerifier;
    const token = await tiktokService.exchangeCode({ code: req.query.code, redirectUri, codeVerifier });
    const user = await tiktokService.getUserInfo(token.access_token);
    if (!user) throw new Error('Could not retrieve TikTok user info.');
    const displayName = user.display_name || token.open_id;
    await accountModel.upsert({
      userId: req.user.id,
      platform: 'tiktok',
      platformUserId: token.open_id || user.open_id,
      username: displayName,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      metadata: { openId: token.open_id, displayName }
    });

    const grantedTt = String(token.scope || '').split(',').map((s) => s.trim()).filter(Boolean);
    const missingTt = ['video.publish'].filter((s) => !grantedTt.includes(s));
    if (missingTt.length) {
      req.flash('error', `TikTok connected (@${displayName}) but video.publish permission was not granted — publishing will fail. Disconnect and reconnect, approving all permissions.`);
    } else {
      req.flash('success', `TikTok connected: ${displayName}`);
    }
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

async function disconnect(req, res, next) {
  try {
    await accountModel.remove(req.params.id, req.user.id);
    req.flash('success', 'Account disconnected.');
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  index,
  connectInstagram,
  instagramCallback,
  connectInstagramDirect,
  instagramLoginCallback,
  connectYouTube,
  youtubeCallback,
  connectPinterest,
  pinterestCallback,
  connectPinterestToken,
  pinterestTokenConnect,
  connectTikTok,
  tiktokCallback,
  debugInstagramPages,
  debugInstagramPagesJson,
  disconnect
};
