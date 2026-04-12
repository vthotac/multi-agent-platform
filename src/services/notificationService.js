/**
 * Lightweight notification hook for downstream systems (Slack, Discord, internal webhooks).
 */
async function notify(event, payload = {}) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) {
    return { delivered: false, reason: 'NOTIFY_WEBHOOK_URL not set' };
  }

  const body = JSON.stringify({
    event,
    payload,
    ts: new Date().toISOString(),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Notification webhook failed: ${res.status} ${text}`);
  }

  return { delivered: true };
}

module.exports = { notify };
