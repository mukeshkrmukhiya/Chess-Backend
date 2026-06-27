const buckets = new Map();

// Applies lightweight in-memory rate limiting per IP.
const rateLimiter = (limit = 120, windowMs = 15 * 60 * 1000) => (req, res, next) => {
  const key = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > limit) {
    return res.status(429).json({ message: 'Too many requests, please try again later' });
  }

  return next();
};

module.exports = rateLimiter;
