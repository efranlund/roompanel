import { CalendarEvent } from "@/lib/types";
import styles from "./MeetingCard.module.css";

interface MeetingCardProps {
  event: CalendarEvent;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MeetingCard({ event }: MeetingCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.time}>
        {formatTime(event.start)} — {formatTime(event.end)}
      </div>
      <div className={styles.title}>{event.title}</div>
      {event.organizer && (
        <div className={styles.organizer}>{event.organizer}</div>
      )}
    </div>
  );
}
