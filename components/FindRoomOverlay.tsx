"use client";

import { useEffect, useState } from "react";
import { RoomStatus } from "@/lib/types";
import styles from "./FindRoomOverlay.module.css";

interface FindRoomOverlayProps {
  currentSlug: string;
  durationMinutes: number;
  onBook: (slug: string) => void;
  onClose: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FindRoomOverlay({
  currentSlug,
  durationMinutes,
  onBook,
  onClose,
}: FindRoomOverlayProps) {
  const [statuses, setStatuses] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);

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

  const now = new Date();
  const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          FIND A ROOM — {durationMinutes} MIN
        </h2>
        <button className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>
      <p className={styles.subtitle}>
        Available rooms for {formatTime(now)} — {formatTime(endTime)}
      </p>

      {loading ? (
        <div className={styles.loading}>Checking rooms...</div>
      ) : (
        <div className={styles.grid}>
          {statuses.map((s) => {
            const isCurrent = s.room.slug === currentSlug;
            const isAvailable = s.room.slug !== currentSlug && s.isAvailable;
            const busyUntil = s.occupiedUntil
              ? new Date(s.occupiedUntil).toLocaleTimeString("sv-SE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
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
                onClick={() => isAvailable && onBook(s.room.slug)}
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
