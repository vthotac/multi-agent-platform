const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/live', (_req, res) => {
  res.status(200).json({
    ok: true,
    mode: 'bare-minimum',
    ts: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    mode: 'bare-minimum',
    ts: new Date().toISOString(),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Listening on :${PORT}`);
});
