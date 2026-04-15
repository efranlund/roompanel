import styles from "./StatusPill.module.css";

interface StatusPillProps {
  isAvailable: boolean;
  occupiedUntil: string | null;
}

export default function StatusPill({ isAvailable, occupiedUntil }: StatusPillProps) {
  const untilTime = occupiedUntil
    ? new Date(occupiedUntil).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className={`${styles.pill} ${isAvailable ? styles.available : styles.busy}`}>
      <span className={`${styles.dot} ${isAvailable ? styles.dotAvailable : styles.dotBusy}`} />
      {isAvailable ? "Available" : `Occupied until ${untilTime}`}
    </div>
  );
}
