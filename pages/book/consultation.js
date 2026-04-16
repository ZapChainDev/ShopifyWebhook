import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const GHL_BOOKING_URL =
  "https://api.leadconnectorhq.com/widget/bookings/consultation-alyssa";

// Validation states
const STATUS = {
  LOADING: "loading",
  VALID: "valid",
  INVALID: "invalid",
};

const ERROR_MESSAGES = {
  400: "No booking token was provided. Please use the link from your order confirmation email.",
  404: "This booking link is not recognised. Please contact support.",
  409: "This booking link has already been used. If you believe this is an error, please contact support.",
  410: "This booking link has expired. Please contact support to request a new one.",
  500: "Something went wrong on our end. Please try again or contact support.",
};

export default function ConsultationBookingPage() {
  const router = useRouter();
  const { token } = router.query;

  const [status, setStatus] = useState(STATUS.LOADING);
  const [errorMessage, setErrorMessage] = useState("");
  const [markingUsed, setMarkingUsed] = useState(false);
  const [markedUsed, setMarkedUsed] = useState(false);

  useEffect(() => {
    // router.query is empty on the first render during SSR hydration.
    if (!router.isReady) return;

    if (!token) {
      setErrorMessage(ERROR_MESSAGES[400]);
      setStatus(STATUS.INVALID);
      return;
    }

    async function validate() {
      try {
        const res = await fetch(
          `/api/validate-booking-token?token=${encodeURIComponent(token)}`,
        );
        if (res.ok) {
          setStatus(STATUS.VALID);
        } else {
          const errorMsg = ERROR_MESSAGES[res.status] ?? ERROR_MESSAGES[500];
          setErrorMessage(errorMsg);
          setStatus(STATUS.INVALID);
        }
      } catch {
        setErrorMessage(ERROR_MESSAGES[500]);
        setStatus(STATUS.INVALID);
      }
    }

    validate();
  }, [router.isReady, token]);

  async function handleBookingComplete() {
    if (!token || markingUsed || markedUsed) return;
    setMarkingUsed(true);
    try {
      await fetch("/api/mark-booking-used", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Non-critical — the booking was still completed.
    } finally {
      setMarkingUsed(false);
      setMarkedUsed(true);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (status === STATUS.LOADING) {
    return (
      <main style={styles.container}>
        <p style={styles.message}>Verifying your booking link&hellip;</p>
      </main>
    );
  }

  if (status === STATUS.INVALID) {
    return (
      <main style={styles.container}>
        <h1 style={styles.heading}>Unable to load booking</h1>
        <p style={styles.message}>{errorMessage}</p>
      </main>
    );
  }

  return (
    <main style={styles.container}>
      <h1 style={styles.heading}>Book Your Consultation</h1>
      <p style={styles.subheading}>
        Use the calendar below to pick a time that works for you.
      </p>

      <iframe
        src={GHL_BOOKING_URL}
        style={styles.iframe}
        title="Book your consultation"
        frameBorder="0"
      />

      <div style={styles.buttonWrapper}>
        {markedUsed ? (
          <p style={styles.successMessage}>
            Thanks! Your booking has been confirmed.
          </p>
        ) : (
          <button
            onClick={handleBookingComplete}
            disabled={markingUsed}
            style={styles.button}
          >
            {markingUsed ? "Saving…" : "I completed my booking"}
          </button>
        )}
      </div>
    </main>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────────

const styles = {
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: "sans-serif",
    textAlign: "center",
  },
  heading: {
    fontSize: "1.75rem",
    marginBottom: "8px",
  },
  subheading: {
    color: "#555",
    marginBottom: "24px",
  },
  message: {
    color: "#555",
    fontSize: "1rem",
  },
  iframe: {
    width: "100%",
    height: "700px",
    border: "none",
    borderRadius: "8px",
  },
  buttonWrapper: {
    marginTop: "24px",
  },
  button: {
    padding: "12px 28px",
    fontSize: "1rem",
    backgroundColor: "#0070f3",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  successMessage: {
    color: "#16a34a",
    fontWeight: "bold",
    fontSize: "1rem",
  },
};
