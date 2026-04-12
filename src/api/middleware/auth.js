function parseApiKeys() {
  const raw = process.env.PLATFORM_API_KEYS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function requireApiKey(req, res, next) {
  const keys = parseApiKeys();
  if (!keys.size) {
    const err = new Error('Server misconfiguration: PLATFORM_API_KEYS is empty');
    err.statusCode = 500;
    return next(err);
  }

  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const fromHeader = bearer || req.headers['x-api-key'];

  if (!fromHeader || !keys.has(fromHeader)) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    return next(err);
  }

  return next();
}

module.exports = { requireApiKey, parseApiKeys };
