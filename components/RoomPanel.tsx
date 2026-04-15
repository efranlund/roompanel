"use client";

import { useEffect, useState, useCallback } from "react";
import { Room, RoomStatus } from "@/lib/types";
import StatusPill from "./StatusPill";
import MeetingCard from "./MeetingCard";
import CurrentMeeting from "./CurrentMeeting";
import styles from "./RoomPanel.module.css";

interface RoomPanelProps {
  room: Room;
}

export default function RoomPanel({ room }: RoomPanelProps) {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [bookedUntil, setBookedUntil] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/calendar/${room.slug}`);
    if (res.ok) {
      const data: RoomStatus = await res.json();
      setStatus(data);
    }
  }, [room.slug]);

  // Poll every 30 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Full page reload every 5 minutes (safety net)
  useEffect(() => {
    const timeout = setTimeout(() => window.location.reload(), 5 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, []);

  function handleBooked(until: string) {
    setBookedUntil(until);
    fetchStatus();
    setTimeout(() => setBookedUntil(null), 3000);
  }

  if (!status) {
    return (
      <div className={`${styles.panel} ${styles.available}`}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  const isAvailable = status.isAvailable;

  return (
    <div className={`${styles.panel} ${isAvailable ? styles.available : styles.occupied}`}>
      <div className={styles.left}>
        <div className={styles.logoContainer}>
          <img src={room.logo} alt={room.name} className={styles.logo} />
        </div>
        <h1 className={styles.roomName}>{room.name.toUpperCase()}</h1>
        <p className={styles.roomLocation}>{room.location}</p>
        <StatusPill
          isAvailable={isAvailable}
          occupiedUntil={status.occupiedUntil}
        />
        {!isAvailable && status.currentEvent && (
          <CurrentMeeting event={status.currentEvent} />
        )}
        {/* BookingButton and FindRoom will be added in later tasks */}
      </div>

      <div className={styles.right}>
        <span className={styles.scheduleLabel}>
          {isAvailable ? "Upcoming Today" : "Up Next"}
        </span>
        <div className={styles.meetingList}>
          {status.upcomingEvents.map((event, i) => (
            <MeetingCard key={i} event={event} />
          ))}
          {status.upcomingEvents.length === 0 && (
            <p className={styles.noEvents}>No more meetings today</p>
          )}
        </div>
      </div>

      {/* EP logo watermark */}
      <img
        src="/logos/ep-logo.svg"
        alt=""
        className={styles.epWatermark}
        aria-hidden="true"
      />
    </div>
  );
}
