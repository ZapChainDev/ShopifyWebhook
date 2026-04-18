// ── Upstash Redis helper ──────────────────────────────────────────────────────

async function getRedisToken(token) {
  const key = `booking_token:${token}`;
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["GET", key]),
  });
  if (!res.ok) {
    throw new Error(`Upstash GET failed with status ${res.status}`);
  }
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  return JSON.parse(data.result);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const { token } = req.query;

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

    if (record.used) {
      return res
        .status(409)
        .json({ success: false, error: "Token has already been used" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[validate-booking-token] Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
