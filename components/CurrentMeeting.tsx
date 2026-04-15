"use client";

import { useEffect, useState } from "react";
import { CalendarEvent } from "@/lib/types";
import styles from "./CurrentMeeting.module.css";

interface CurrentMeetingProps {
  event: CalendarEvent;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CurrentMeeting({ event }: CurrentMeetingProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function updateProgress() {
      const now = Date.now();
      const start = new Date(event.start).getTime();
      const end = new Date(event.end).getTime();
      const total = end - start;
      const elapsed = now - start;
      setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
    }

    updateProgress();
    const interval = setInterval(updateProgress, 10_000);
    return () => clearInterval(interval);
  }, [event.start, event.end]);

  return (
    <div className={styles.container}>
      <div className={styles.label}>NOW</div>
      <div className={styles.title}>{event.title}</div>
      <div className={styles.time}>
        {formatTime(event.start)} — {formatTime(event.end)}
        {event.organizer && ` · ${event.organizer}`}
      </div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
