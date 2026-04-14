const BOOKING_LINKS = {
  consultation:
    "https://api.leadconnectorhq.com/widget/bookings/consultation-alyssa",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    console.log(
      "[get-booking-link] Incoming request body:",
      JSON.stringify(req.body, null, 2),
    );

    const productName =
      req.body?.line_items?.[0]?.title ||
      req.body?.line_items?.[0]?.name ||
      req.body?.productName ||
      "";

    console.log("[get-booking-link] Resolved product name:", productName);

    const normalizedName = productName.trim().toLowerCase();

    let bookingLink = null;

    if (normalizedName === "consultation") {
      bookingLink = BOOKING_LINKS.consultation;
    }

    if (!bookingLink) {
      return res.status(400).json({
        success: false,
        error: `No booking link found for product: "${productName}"`,
      });
    }

    return res.status(200).json({ success: true, bookingLink });
  } catch (error) {
    console.error("[get-booking-link] Server error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
