import {
  getBookingToken,
  isTokenExpired,
  markBookingTokenUsed,
} from "../../lib/tokenStore";

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
    const record = await getBookingToken(token);

    if (!record) {
      return res.status(404).json({ success: false, error: "Token not found" });
    }

    if (isTokenExpired(record)) {
      return res
        .status(410)
        .json({ success: false, error: "Token has expired" });
    }

    await markBookingTokenUsed(token);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[mark-booking-used] Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
