import styles from "./BookingConfirmation.module.css";

interface BookingConfirmationProps {
  bookedUntil: string;
}

export default function BookingConfirmation({ bookedUntil }: BookingConfirmationProps) {
  const time = new Date(bookedUntil).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={styles.overlay}>
      <div className={styles.checkmark}>✓</div>
      <h2 className={styles.title}>BOOKED</h2>
      <p className={styles.subtitle}>until {time}</p>
    </div>
  );
}
