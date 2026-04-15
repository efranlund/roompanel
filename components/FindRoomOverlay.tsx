"use client";

import { useEffect, useState } from "react";
import { RoomStatus } from "@/lib/types";
import styles from "./FindRoomOverlay.module.css";

interface FindRoomOverlayProps {
  currentSlug: string;
  onBooked: () => void;
  onClose: () => void;
}

const DURATIONS = [15, 30, 60] as const;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type OverlayState =
  | { step: "grid" }
  | { step: "confirm"; slug: string; roomName: string }
  | { step: "booking" }
  | { step: "success"; roomName: string; bookedUntil: string };

export default function FindRoomOverlay({
  currentSlug,
  onBooked,
  onClose,
}: FindRoomOverlayProps) {
  const [statuses, setStatuses] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<OverlayState>({ step: "grid" });
  const [selectedDuration, setSelectedDuration] = useState<number>(15);

  useEffect(() => {
    async function fetchAll() {
      const res = await fetch("/api/calendar/all");
      if (res.ok) {
        const data: RoomStatus[] = await res.json();
        setStatuses(data);
      }
      setLoading(false);
    }
    fetchAll();
  }, []);

  async function handleBook(slug: string, minutes: number) {
    setState({ step: "booking" });
    const startTime = new Date().toISOString();
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, startTime, durationMinutes: minutes }),
    });
    if (res.ok) {
      const data = await res.json();
      const roomName = statuses.find((s) => s.room.slug === slug)?.room.name || slug;
      setState({ step: "success", roomName, bookedUntil: data.bookedUntil });
      onBooked();
      setTimeout(onClose, 3000);
    } else {
      setState({ step: "grid" });
    }
  }

  const now = new Date();

  // Success state
  if (state.step === "success") {
    const time = formatTime(new Date(state.bookedUntil));
    return (
      <div className={styles.overlay}>
        <div className={styles.successContainer}>
          <div className={styles.successCheck}>✓</div>
          <div className={styles.successTitle}>BOOKED</div>
          <div className={styles.successRoom}>{state.roomName}</div>
          <div className={styles.successTime}>until {time}</div>
        </div>
      </div>
    );
  }

  // Booking in progress
  if (state.step === "booking") {
    return (
      <div className={styles.overlay}>
        <div className={styles.successContainer}>
          <div className={styles.successTitle}>BOOKING...</div>
        </div>
      </div>
    );
  }

  // Confirmation step — pick duration and confirm
  if (state.step === "confirm") {
    const endTime = new Date(now.getTime() + selectedDuration * 60 * 1000);
    return (
      <div className={styles.overlay}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            BOOK {state.roomName.toUpperCase()}
          </h2>
          <button className={styles.closeBtn} onClick={() => setState({ step: "grid" })}>
            ←
          </button>
        </div>
        <p className={styles.subtitle}>
          {formatTime(now)} — {formatTime(endTime)}
        </p>

        <div className={styles.confirmContainer}>
          <div className={styles.durationPicker}>
            {DURATIONS.map((d) => {
              const end = new Date(now.getTime() + d * 60 * 1000);
              return (
                <button
                  key={d}
                  className={`${styles.durationBtn} ${selectedDuration === d ? styles.durationActive : ""}`}
                  onClick={() => setSelectedDuration(d)}
                >
                  <span className={styles.durationMain}>{d} min</span>
                  <span className={styles.durationSub}>until {formatTime(end)}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.confirmActions}>
            <button
              className={styles.confirmBook}
              onClick={() => handleBook(state.slug, selectedDuration)}
            >
              Book {state.roomName} for {selectedDuration} min
            </button>
            <button
              className={styles.confirmCancel}
              onClick={() => setState({ step: "grid" })}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Grid step — room list
  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2 className={styles.title}>FIND A ROOM</h2>
        <button className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>
      <p className={styles.subtitle}>
        Tap a room to book it
      </p>

      {loading ? (
        <div className={styles.loading}>Checking rooms...</div>
      ) : (
        <div className={styles.grid}>
          {statuses.map((s) => {
            const isCurrent = s.room.slug === currentSlug;
            const isAvailable = s.room.slug !== currentSlug && s.isAvailable;
            const busyUntil = s.occupiedUntil
              ? formatTime(new Date(s.occupiedUntil))
              : null;

            return (
              <button
                key={s.room.slug}
                className={`${styles.roomCard} ${
                  isCurrent
                    ? styles.current
                    : isAvailable
                    ? styles.roomAvailable
                    : styles.roomBusy
                }`}
                onClick={() =>
                  isAvailable &&
                  setState({ step: "confirm", slug: s.room.slug, roomName: s.room.name })
                }
                disabled={!isAvailable}
              >
                <div className={styles.roomLogo}>
                  <img
                    src={s.room.logo}
                    alt={s.room.name}
                    className={styles.roomLogoImg}
                  />
                </div>
                <div className={styles.roomName}>
                  {s.room.name.toUpperCase()}
                </div>
                <div className={styles.roomLocation}>{s.room.location}</div>
                <div className={styles.roomStatus}>
                  {isCurrent
                    ? "You are here"
                    : isAvailable
                    ? "Available"
                    : `Busy until ${busyUntil}`}
                </div>
                {isAvailable && (
                  <div className={styles.tapLabel}>Tap to book</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
