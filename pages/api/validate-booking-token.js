import { getBookingToken, isTokenExpired } from "../../lib/tokenStore";

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
    const record = await getBookingToken(token);

    if (!record) {
      return res.status(404).json({ success: false, error: "Token not found" });
    }

    if (isTokenExpired(record)) {
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
