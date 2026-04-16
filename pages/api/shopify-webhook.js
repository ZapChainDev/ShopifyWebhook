import crypto from "crypto";
import { saveBookingToken } from "../../lib/tokenStore";

// Disable Next.js body parsing — Shopify HMAC verification requires the raw body.
export const config = {
  api: {
    bodyParser: false,
  },
};

const TOKEN_EXPIRY_DAYS = 7;

// ── Raw body reader ───────────────────────────────────────────────────────────

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Shopify HMAC verification ─────────────────────────────────────────────────

function verifyShopifySignature(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_WEBHOOK_SECRET is not set");
  }
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const digestBuffer = Buffer.from(digest);
  const headerBuffer = Buffer.from(hmacHeader);
  if (digestBuffer.length !== headerBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(digestBuffer, headerBuffer);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const rawBody = await getRawBody(req);

    // Verify Shopify signature before touching the payload.
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    if (!hmacHeader) {
      return res
        .status(401)
        .json({ success: false, error: "Missing HMAC signature" });
    }
    if (!verifyShopifySignature(rawBody, hmacHeader)) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid HMAC signature" });
    }

    console.log("[shopify-webhook] Verified webhook received");

    const body = JSON.parse(rawBody.toString("utf8"));

    // ── Extract order data ─────────────────────────────────────────────────
    const productName =
      body?.line_items?.[0]?.title || body?.line_items?.[0]?.name || "";

    console.log("[shopify-webhook] Resolved product name:", productName);

    const orderId = body?.id ?? null;
    const email = body?.email ?? body?.customer?.email ?? "";
    const firstName = body?.customer?.first_name ?? "";
    const lastName = body?.customer?.last_name ?? "";

    // ── Route by product ───────────────────────────────────────────────────
    if (productName.trim() === "Consultation") {
      const token = crypto.randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);

      await saveBookingToken({
        token,
        used: false,
        productName,
        orderId,
        email,
        firstName,
        lastName,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      const protectedBookingUrl = `${appUrl}/book/consultation?token=${token}`;

      console.log(
        "[shopify-webhook] Protected booking URL generated:",
        protectedBookingUrl,
      );

      return res
        .status(200)
        .json({ success: true, productName, protectedBookingUrl });
    }

    // Unrecognised product — acknowledge receipt without error so Shopify
    // does not retry, but signal that no action was taken.
    return res.status(200).json({
      success: true,
      productName,
      message: "No booking action configured for this product",
    });
  } catch (error) {
    console.error("[shopify-webhook] Server error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
