"use client";

import { useState } from "react";
import styles from "./BookingButton.module.css";

interface BookingButtonProps {
  roomSlug: string;
  onBooked: (bookedUntil: string) => void;
}

const DURATIONS = [15, 30, 60] as const;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookingButton({ roomSlug, onBooked }: BookingButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBook(minutes: number) {
    setBooking(true);
    setError(null);
    const startTime = new Date().toISOString();

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: roomSlug,
          startTime,
          durationMinutes: minutes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onBooked(data.bookedUntil);
        setExpanded(false);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Booking failed. Please try again.");
        setTimeout(() => setError(null), 5000);
      }
    } catch {
      setError("Network error. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setBooking(false);
    }
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + 15 * 60 * 1000);

  if (error) {
    return (
      <div className={styles.errorBox}>
        <span className={styles.errorIcon}>!</span>
        <span>{error}</span>
      </div>
    );
  }

  if (expanded) {
    return (
      <div className={styles.selector}>
        {DURATIONS.map((d) => {
          const end = new Date(now.getTime() + d * 60 * 1000);
          return (
            <button
              key={d}
              className={styles.durationBtn}
              onClick={() => handleBook(d)}
              disabled={booking}
            >
              <span className={styles.durationMain}>{d} min</span>
              <span className={styles.durationSub}>
                until {formatTime(end)}
              </span>
            </button>
          );
        })}
        <button
          className={styles.cancelBtn}
          onClick={() => setExpanded(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      className={styles.bookBtn}
      onClick={() => setExpanded(true)}
      disabled={booking}
    >
      <span className={styles.bookIcon}>+</span>
      <div>
        <span className={styles.bookMain}>Book 15 min</span>
        <span className={styles.bookSub}>
          {formatTime(now)} — {formatTime(endTime)}
        </span>
      </div>
    </button>
  );
}
