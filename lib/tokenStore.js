/**
 * Token store for booking access tokens.
 *
 * Storage strategy:
 *   - If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, uses the
 *     Upstash Redis REST API (no extra package required, free tier available).
 *     Sign up at https://upstash.com and create a Redis database.
 *   - Otherwise falls back to an in-memory Map.
 *
 * WARNING: The in-memory fallback is NOT production-safe.
 * Tokens will be lost on server restart and are not shared across
 * multiple serverless function instances.
 */

const TOKEN_KEY_PREFIX = "booking_token:";

// ── In-memory fallback ───────────────────────────────────────────────────────
// WARNING: Not production-safe. Use Upstash Redis in production.
const memoryStore = new Map();

// ── Upstash Redis helpers (REST API) ─────────────────────────────────────────
//
// Upstash exposes Redis commands as HTTP POST requests where the body is a
// JSON array: ["COMMAND", "arg1", "arg2", ...]
// Docs: https://upstash.com/docs/redis/features/restapi

function isRedisConfigured() {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function redisCommand(...args) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Upstash Redis command failed with status ${res.status}`);
  }
  const data = await res.json();
  return data.result;
}

async function kvSet(key, value) {
  await redisCommand("SET", key, JSON.stringify(value));
}

async function kvGet(key) {
  const result = await redisCommand("GET", key);
  if (result === null || result === undefined) return null;
  return JSON.parse(result);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist a new booking token record.
 * @param {object} data - The full token record to save.
 */
export async function saveBookingToken(data) {
  const key = TOKEN_KEY_PREFIX + data.token;
  if (isRedisConfigured()) {
    await kvSet(key, data);
  } else {
    memoryStore.set(key, data);
  }
}

/**
 * Retrieve a booking token record by token string.
 * Returns null if not found.
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function getBookingToken(token) {
  const key = TOKEN_KEY_PREFIX + token;
  if (isRedisConfigured()) {
    return await kvGet(key);
  }
  return memoryStore.get(key) ?? null;
}

/**
 * Mark a booking token as used.
 * Returns false if the token does not exist.
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function markBookingTokenUsed(token) {
  const record = await getBookingToken(token);
  if (!record) return false;
  record.used = true;
  const key = TOKEN_KEY_PREFIX + token;
  if (isRedisConfigured()) {
    await kvSet(key, record);
  } else {
    memoryStore.set(key, record);
  }
  return true;
}

/**
 * Check whether a token record has passed its expiry date.
 * @param {object} record
 * @returns {boolean}
 */
export function isTokenExpired(record) {
  return new Date() > new Date(record.expiresAt);
}
