function errorHandler(err, req, res, _next) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message = status === 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;

  if (status >= 500) {
    console.error('[api]', req.method, req.originalUrl, err);
  }

  res.status(status).json({
    error: message,
    requestId: req.id,
  });
}

module.exports = { errorHandler };
