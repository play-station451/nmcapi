const WINDOW_MS = 60000;
const MAX_REQUESTS = 60;
const MAX_TRACKED_CLIENTS = 10000;

const clients = new Map();

const cleanup = setInterval(() => {
  const now = Date.now();

  for (const [client, entry] of clients) {
    if (entry.resetAt <= now) {
      clients.delete(client);
    }
  }
}, WINDOW_MS);

cleanup.unref();

export function rateLimit(req, res, next) {
  const now = Date.now();
  const client = req.ip ?? "unknown";
  let entry = clients.get(client);

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + WINDOW_MS
    };
    clients.set(client, entry);
  }

  entry.count += 1;

  const remaining = Math.max(MAX_REQUESTS - entry.count, 0);
  res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      success: false,
      error: "Too many requests"
    });
    return;
  }

  if (clients.size > MAX_TRACKED_CLIENTS) {
    for (const [trackedClient, trackedEntry] of clients) {
      if (trackedEntry.resetAt <= now) {
        clients.delete(trackedClient);
      }
    }
  }

  next();
}
