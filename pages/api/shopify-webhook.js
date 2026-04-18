import crypto from "crypto";

// Disable Next.js body parsing — Shopify HMAC verification requires access to
// the raw, unmodified request body before any JSON parsing occurs.
export const config = {
  api: {
    bodyParser: false,
  },
};

const BOOKING_URL_BASE = "https://oahumedspa.ai/book/consultation";
const TOKEN_EXPIRY_DAYS = 7;

// ── Helper: read the raw request body as a Buffer ────────────────────────────
// Streams the incoming request chunks and concatenates them so we can pass
// the exact bytes to the HMAC verifier.

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Helper: verify the Shopify webhook HMAC signature ────────────────────────
// Shopify signs every webhook with HMAC-SHA256 using your webhook secret and
// sends the base64-encoded digest in the X-Shopify-Hmac-Sha256 header.
// We recompute the digest from the raw body and compare using timingSafeEqual
// to prevent timing-based attacks.

function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_WEBHOOK_SECRET is not configured");
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  // Buffers must be the same length for timingSafeEqual to work.
  const digestBuffer = Buffer.from(digest);
  const headerBuffer = Buffer.from(hmacHeader);
  if (digestBuffer.length !== headerBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(digestBuffer, headerBuffer);
}

// ── Helper: generate a secure random booking token ───────────────────────────
// 32 random bytes gives 256 bits of entropy — unguessable as a URL token.

function generateBookingToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ── Helper: save a booking token record to Upstash Redis ─────────────────────
// Uses the Upstash REST API directly with fetch — no extra packages required.
// Upstash accepts Redis commands as a JSON array: ["COMMAND", "arg1", ...]

async function saveBookingToken(record) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    throw new Error(
      "KV_REST_API_URL or KV_REST_API_TOKEN is not set. Add them to Vercel Environment Variables.",
    );
  }

  const key = `booking_token:${record.token}`;
  const value = JSON.stringify(record);

  const res = await fetch(kvUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, value]),
  });

  if (!res.ok) {
    throw new Error(`Upstash Redis SET failed with status ${res.status}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Step 1 — Only accept POST requests.
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    // Step 2 — Read the raw body before any parsing.
    const rawBody = await getRawBody(req);

    // Step 3 — Verify the Shopify HMAC signature.
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    if (!hmacHeader) {
      return res
        .status(401)
        .json({ success: false, error: "Missing HMAC signature" });
    }
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid HMAC signature" });
    }

    console.log("[shopify-webhook] Webhook verified");

    // Step 4 — Parse JSON only after successful signature verification.
    const body = JSON.parse(rawBody.toString("utf8"));

    // Step 5 — Extract order data from the Shopify payload.
    const productName =
      body?.line_items?.[0]?.title || body?.line_items?.[0]?.name || "";

    console.log("[shopify-webhook] Resolved product name:", productName);

    const orderId = body?.id ?? null;
    const email = body?.email ?? body?.customer?.email ?? "";
    const firstName = body?.customer?.first_name ?? "";
    const lastName = body?.customer?.last_name ?? "";

    // Step 6 — Route by product name.
    if (productName.trim() === "Consultation") {
      // Generate a cryptographically secure token.
      const token = generateBookingToken();
      console.log("[shopify-webhook] Token created:", token);

      // Calculate expiry (7 days from now).
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);

      // Persist the token record in Upstash Redis.
      await saveBookingToken({
        token,
        email,
        orderId,
        firstName,
        lastName,
        product: "Consultation",
        used: false,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      // Build the protected booking link.
      const bookingLink = `${BOOKING_URL_BASE}?token=${token}`;
      console.log("[shopify-webhook] Booking link created:", bookingLink);

      return res.status(200).json({
        success: true,
        productName: "Consultation",
        bookingLink,
        token,
      });
    }

    // Step 7 — Acknowledge unrecognised products so Shopify doesn't retry.
    return res.status(200).json({
      success: true,
      productName,
      message: "No booking token generated for this product",
    });
  } catch (error) {
    console.error("[shopify-webhook] Server error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
