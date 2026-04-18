// ── Upstash Redis helpers ─────────────────────────────────────────────────────

async function redisCommand(...args) {
  const kvUrl = process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set. Add them to Vercel Environment Variables.",
    );
  }
  const res = await fetch(kvUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
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

async function getRedisToken(token) {
  const key = `booking_token:${token}`;
  const result = await redisCommand("GET", key);
  if (result === null || result === undefined) return null;
  return JSON.parse(result);
}

async function setRedisToken(token, record) {
  const key = `booking_token:${token}`;
  await redisCommand("SET", key, JSON.stringify(record));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const { token } = req.body ?? {};

  if (!token) {
    return res.status(400).json({ success: false, error: "Missing token" });
  }

  try {
    const record = await getRedisToken(token);

    if (!record) {
      return res.status(404).json({ success: false, error: "Token not found" });
    }

    if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
      return res
        .status(410)
        .json({ success: false, error: "Token has expired" });
    }

    record.used = true;
    await setRedisToken(token, record);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[mark-booking-used] Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
