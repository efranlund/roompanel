"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Room, RoomStatus } from "@/lib/types";
import StatusPill from "./StatusPill";
import MeetingCard from "./MeetingCard";
import CurrentMeeting from "./CurrentMeeting";
import BookingButton from "./BookingButton";
import FindRoomOverlay from "./FindRoomOverlay";
import BookingConfirmation from "./BookingConfirmation";
import HockeyGame from "./HockeyGame";
import styles from "./RoomPanel.module.css";

interface RoomPanelProps {
  room: Room;
}

export default function RoomPanel({ room }: RoomPanelProps) {
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [bookedUntil, setBookedUntil] = useState<string | null>(null);
  const [showFindRoom, setShowFindRoom] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const tapTimes = useRef<number[]>([]);

  function handleLogoTap() {
    const now = Date.now();
    tapTimes.current = [...tapTimes.current, now].filter((t) => now - t < 1500);
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      setShowGame(true);
    }
  }

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/calendar/${room.slug}`);
    if (res.ok) {
      const data: RoomStatus = await res.json();
      setStatus(data);
    }
  }, [room.slug]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function handleFindRoomBooked() {
    fetchStatus();
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
          <img
            src={room.logo}
            alt={room.name}
            className={styles.logo}
            onClick={handleLogoTap}
            style={{ cursor: "pointer" }}
          />
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
        {isAvailable && (
          <div className={styles.actionRow}>
            <BookingButton roomSlug={room.slug} onBooked={handleBooked} />
            <button className={styles.findBtn} onClick={() => setShowFindRoom(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              Find a Room
            </button>
          </div>
        )}
        {!isAvailable && (
          <div className={styles.actionRow}>
            <button className={styles.findBtn} onClick={() => setShowFindRoom(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              Find a Room
            </button>
          </div>
        )}
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

      <div className={styles.clock}>
        {now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
      </div>

      {/* EP logo watermark */}
      <img
        src="/logos/ep-logo.jpg"
        alt=""
        className={styles.epWatermark}
        aria-hidden="true"
      />

      {showFindRoom && (
        <FindRoomOverlay
          currentSlug={room.slug}
          onBooked={handleFindRoomBooked}
          onClose={() => setShowFindRoom(false)}
        />
      )}
      {bookedUntil && <BookingConfirmation bookedUntil={bookedUntil} />}
      {showGame && <HockeyGame onClose={() => setShowGame(false)} />}
    </div>
  );
}
