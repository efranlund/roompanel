import Link from "next/link";
import { rooms } from "@/lib/rooms";

export default function Home() {
  return (
    <div
      style={{
        width: "1920px",
        height: "1200px",
        background: "var(--gradient-available)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        fontFamily: "var(--font-body)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "64px",
          letterSpacing: "4px",
        }}
      >
        ROOMPANEL
      </h1>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
        {rooms.map((room) => (
          <Link
            key={room.slug}
            href={`/rooms/${room.slug}`}
            style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              borderRadius: "12px",
              padding: "20px 32px",
              color: "var(--ep-text)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "18px",
            }}
          >
            {room.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
