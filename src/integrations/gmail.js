const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function loadOAuthClientFromOptionalJson() {
  const p = process.env.GMAIL_OAUTH_CLIENT_JSON_PATH;
  if (!p) return null;
  const resolved = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  if (!fs.existsSync(resolved)) {
    throw new Error(`GMAIL_OAUTH_CLIENT_JSON_PATH not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const json = JSON.parse(raw);
  const web = json.web || json.installed;
  if (!web) {
    throw new Error('OAuth client JSON must contain web or installed client credentials');
  }
  return {
    clientId: web.client_id,
    clientSecret: web.client_secret,
    redirectUri: (web.redirect_uris && web.redirect_uris[0]) || 'http://localhost',
  };
}

function getGmailOAuth2Client() {
  const fromFile = loadOAuthClientFromOptionalJson();
  const clientId = fromFile?.clientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = fromFile?.clientSecret || process.env.GMAIL_CLIENT_SECRET;
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI || fromFile?.redirectUri || 'http://localhost';

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth client id/secret missing (env or GMAIL_OAUTH_CLIENT_JSON_PATH)');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('GMAIL_REFRESH_TOKEN is not set');
  }
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function getGmailClient() {
  const auth = getGmailOAuth2Client();
  return google.gmail({ version: 'v1', auth });
}

/**
 * @param {{ maxResults?: number, query?: string, userId?: string }} opts
 */
async function listRecentMessageIds(opts = {}) {
  const gmail = getGmailClient();
  const userId = opts.userId || process.env.GMAIL_USER_EMAIL || 'me';
  const maxResults = Number(opts.maxResults ?? process.env.GMAIL_MAX_MESSAGES ?? 15);
  const q = opts.query || 'is:unread newer_than:7d';

  const list = await gmail.users.messages.list({
    userId,
    maxResults,
    q,
  });
  const messages = list.data.messages || [];
  return messages.map((m) => m.id).filter(Boolean);
}

/**
 * @param {string} messageId
 * @param {string} [userId]
 */
async function getMessageText(messageId, userId) {
  const gmail = getGmailClient();
  const uid = userId || process.env.GMAIL_USER_EMAIL || 'me';
  const res = await gmail.users.messages.get({
    userId: uid,
    id: messageId,
    format: 'full',
  });

  const headers = res.data.payload?.headers || [];
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';

  const parts = [];
  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      parts.push(Buffer.from(part.body.data, 'base64').toString('utf8'));
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  }
  walk(res.data.payload);
  const body = parts.join('\n').slice(0, 20000);

  return {
    id: messageId,
    subject,
    from,
    snippet: res.data.snippet || '',
    body,
  };
}

module.exports = {
  getGmailClient,
  listRecentMessageIds,
  getMessageText,
};
