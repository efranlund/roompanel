# RoomPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app for Yealink RoomPanel Plus devices that shows live meeting room status from TeamUp calendars and supports quick booking.

**Architecture:** Next.js App Router with server-side API routes for ICS parsing and TeamUp API integration. Client-side React components poll the API every 30 seconds. Each room is a dynamic route `/rooms/[slug]` backed by a hardcoded room config.

**Tech Stack:** Next.js 15 (App Router), TypeScript, node-ical (ICS parsing), Vercel deployment

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    — Root layout: fonts, viewport meta, global CSS
│   ├── globals.css                   — EP brand CSS variables, base styles
│   ├── page.tsx                      — Redirect / to first room (or simple index)
│   ├── rooms/
│   │   └── [slug]/
│   │       └── page.tsx              — Server component: validates slug, renders RoomPanel
│   └── api/
│       ├── calendar/
│       │   ├── [slug]/
│       │   │   └── route.ts          — GET: fetch + parse ICS for one room
│       │   └── all/
│       │       └── route.ts          — GET: fetch all rooms in parallel
│       └── book/
│           └── route.ts              — POST: create event via TeamUp API
├── lib/
│   ├── rooms.ts                      — Room config array (slug, name, location, ICS URL, subcalendarId)
│   ├── types.ts                      — CalendarEvent, RoomStatus, Room types
│   ├── ics.ts                        — fetchAndParseICS(): fetch ICS URL, parse, filter today
│   └── teamup.ts                     — createEvent(): POST to TeamUp REST API
└── components/
    ├── RoomPanel.tsx                  — Main client component: polls API, renders state
    ├── StatusPill.tsx                 — Green/red status pill with optional pulse dot
    ├── MeetingCard.tsx                — Single meeting card (glassmorphism)
    ├── CurrentMeeting.tsx             — Active meeting with progress bar (occupied state)
    ├── BookingButton.tsx              — "Book 15 min" with 15/30/60 duration selector
    ├── FindRoomOverlay.tsx            — Full-screen room finder grid
    └── BookingConfirmation.tsx        — Success checkmark, auto-dismiss
```

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.local`, `.gitignore`

- [ ] **Step 1: Initialize Next.js project**

Run:
```bash
npx create-next-app@latest . --typescript --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --yes
```

Note: This creates the project in the current directory. We use `--no-tailwind` because the spec calls for custom CSS with EP brand variables. If create-next-app creates a `src/` directory anyway, that's fine — we'll use it.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install node-ical
```

`node-ical` handles fetching and parsing .ics feeds. No other runtime dependencies needed.

- [ ] **Step 3: Create `.env.local`**

Create `.env.local`:
```
TEAMUP_API_KEY=your_api_key_here
TEAMUP_CALENDAR_KEY=ksbfdc4afb6ab75799
```

The calendar key is extracted from the ICS feed URLs: `https://ics.teamup.com/feed/{calendarKey}/{subcalendarId}.ics`

- [ ] **Step 4: Add `.env.local` to `.gitignore`**

Verify `.env.local` is already in `.gitignore` (create-next-app includes it by default). If not, add it.

- [ ] **Step 5: Verify project runs**

Run:
```bash
npm run dev
```

Expected: Dev server starts on `http://localhost:3000`, shows default Next.js page.

- [ ] **Step 6: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js project with node-ical dependency"
```

---

### Task 2: Types and Room Configuration

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/rooms.ts`

- [ ] **Step 1: Create shared types**

Create `src/lib/types.ts`:
```ts
export interface Room {
  slug: string;
  name: string;
  location: string;
  icsUrl: string;
  subcalendarId: number;
  logo: string; // path to /logos/{file}
}

export interface CalendarEvent {
  title: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  organizer: string;
}

export interface RoomStatus {
  room: Room;
  isAvailable: boolean;
  currentEvent: CalendarEvent | null;
  upcomingEvents: CalendarEvent[];
  occupiedUntil: string | null; // ISO 8601
}
```

- [ ] **Step 2: Create room configuration**

Create `src/lib/rooms.ts`:
```ts
import { Room } from "./types";

export const rooms: Room[] = [
  {
    slug: "blackhawks",
    name: "Blackhawks",
    location: "New Room",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/14997684.ics",
    subcalendarId: 14997684,
    logo: "/logos/blackhawks.png",
  },
  {
    slug: "bruins",
    name: "Bruins",
    location: "Corner Room",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/2488173.ics",
    subcalendarId: 2488173,
    logo: "/logos/bruins.png",
  },
  {
    slug: "canadiens",
    name: "Canadiens",
    location: "The Studio",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/6317703.ics",
    subcalendarId: 6317703,
    logo: "/logos/canadiens.png",
  },
  {
    slug: "maple-leafs",
    name: "Maple Leafs",
    location: "Behind Kitchen",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582646.ics",
    subcalendarId: 4582646,
    logo: "/logos/maple-leafs.png",
  },
  {
    slug: "red-wings",
    name: "Red Wings",
    location: "By the Window",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582645.ics",
    subcalendarId: 4582645,
    logo: "/logos/red-wings.png",
  },
  {
    slug: "tre-kronor",
    name: "Tre Kronor",
    location: "The Big Room",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582647.ics",
    subcalendarId: 4582647,
    logo: "/logos/tre-kronor.png",
  },
];

export function getRoomBySlug(slug: string): Room | undefined {
  return rooms.find((r) => r.slug === slug);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/rooms.ts && git commit -m "feat: add room config and shared types"
```

---

### Task 3: ICS Parsing and Single Room API Route

**Files:**
- Create: `src/lib/ics.ts`
- Create: `src/app/api/calendar/[slug]/route.ts`

- [ ] **Step 1: Create ICS parsing module**

Create `src/lib/ics.ts`:
```ts
import ical, { VEvent } from "node-ical";
import { CalendarEvent } from "./types";

export async function fetchTodayEvents(icsUrl: string): Promise<CalendarEvent[]> {
  const data = await ical.async.fromURL(icsUrl);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const events: CalendarEvent[] = [];

  for (const key in data) {
    const entry = data[key];
    if (entry.type !== "VEVENT") continue;

    const vevent = entry as VEvent;
    const start = new Date(vevent.start);
    const end = new Date(vevent.end);

    // Include events that overlap with today
    if (end > startOfDay && start < endOfDay) {
      events.push({
        title: vevent.summary || "Untitled",
        start: start.toISOString(),
        end: end.toISOString(),
        organizer: typeof vevent.organizer === "string"
          ? vevent.organizer
          : vevent.organizer?.params?.CN || "",
      });
    }
  }

  // Sort by start time
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return events;
}
```

- [ ] **Step 2: Create single room calendar API route**

Create `src/app/api/calendar/[slug]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getRoomBySlug } from "@/lib/rooms";
import { fetchTodayEvents } from "@/lib/ics";
import { RoomStatus, CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const room = getRoomBySlug(slug);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const events = await fetchTodayEvents(room.icsUrl);
  const now = new Date();

  // Find current event
  const currentEvent = events.find(
    (e) => new Date(e.start) <= now && new Date(e.end) > now
  ) || null;

  // Get upcoming events (after now, up to 3)
  const upcomingEvents = events
    .filter((e) => new Date(e.start) > now)
    .slice(0, 3);

  const status: RoomStatus = {
    room,
    isAvailable: currentEvent === null,
    currentEvent,
    upcomingEvents,
    occupiedUntil: currentEvent ? currentEvent.end : null,
  };

  return NextResponse.json(status);
}
```

- [ ] **Step 3: Test the API route manually**

Run:
```bash
npm run dev
```

Open: `http://localhost:3000/api/calendar/blackhawks`

Expected: JSON response with `isAvailable`, `currentEvent`, `upcomingEvents` fields. The events come from the live TeamUp ICS feed. If no events today, `isAvailable: true`, `currentEvent: null`, `upcomingEvents: []`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ics.ts src/app/api/calendar/\[slug\]/route.ts && git commit -m "feat: add ICS parsing and single room calendar API"
```

---

### Task 4: All Rooms API Route

**Files:**
- Create: `src/app/api/calendar/all/route.ts`

- [ ] **Step 1: Create all-rooms API route**

Create `src/app/api/calendar/all/route.ts`:
```ts
import { NextResponse } from "next/server";
import { rooms } from "@/lib/rooms";
import { fetchTodayEvents } from "@/lib/ics";
import { RoomStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();

  const statuses: RoomStatus[] = await Promise.all(
    rooms.map(async (room) => {
      const events = await fetchTodayEvents(room.icsUrl);

      const currentEvent = events.find(
        (e) => new Date(e.start) <= now && new Date(e.end) > now
      ) || null;

      const upcomingEvents = events
        .filter((e) => new Date(e.start) > now)
        .slice(0, 3);

      return {
        room,
        isAvailable: currentEvent === null,
        currentEvent,
        upcomingEvents,
        occupiedUntil: currentEvent ? currentEvent.end : null,
      };
    })
  );

  return NextResponse.json(statuses);
}
```

- [ ] **Step 2: Test the API route manually**

Open: `http://localhost:3000/api/calendar/all`

Expected: JSON array of 6 `RoomStatus` objects, one per room. Each fetched in parallel.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/all/route.ts && git commit -m "feat: add all-rooms calendar API"
```

---

### Task 5: TeamUp Booking API Route

**Files:**
- Create: `src/lib/teamup.ts`
- Create: `src/app/api/book/route.ts`

- [ ] **Step 1: Create TeamUp API client**

Create `src/lib/teamup.ts`:
```ts
const TEAMUP_API_BASE = "https://api.teamup.com";

interface CreateEventParams {
  calendarKey: string;
  subcalendarId: number;
  title: string;
  startDt: string; // ISO 8601
  endDt: string;   // ISO 8601
}

interface TeamUpEventResponse {
  event: {
    id: string;
    subcalendar_ids: number[];
    title: string;
    start_dt: string;
    end_dt: string;
  };
}

export async function createEvent(params: CreateEventParams): Promise<TeamUpEventResponse> {
  const apiKey = process.env.TEAMUP_API_KEY;
  if (!apiKey) {
    throw new Error("TEAMUP_API_KEY environment variable is not set");
  }

  const response = await fetch(
    `${TEAMUP_API_BASE}/${params.calendarKey}/events`,
    {
      method: "POST",
      headers: {
        "Teamup-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subcalendar_ids: [params.subcalendarId],
        title: params.title,
        start_dt: params.startDt,
        end_dt: params.endDt,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TeamUp API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Create booking API route**

Create `src/app/api/book/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getRoomBySlug } from "@/lib/rooms";
import { createEvent } from "@/lib/teamup";

export async function POST(request: Request) {
  const body = await request.json();
  const { slug, startTime, durationMinutes } = body as {
    slug: string;
    startTime: string;
    durationMinutes: number;
  };

  if (!slug || !startTime || !durationMinutes) {
    return NextResponse.json(
      { error: "Missing required fields: slug, startTime, durationMinutes" },
      { status: 400 }
    );
  }

  if (![15, 30, 60].includes(durationMinutes)) {
    return NextResponse.json(
      { error: "durationMinutes must be 15, 30, or 60" },
      { status: 400 }
    );
  }

  const room = getRoomBySlug(slug);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const calendarKey = process.env.TEAMUP_CALENDAR_KEY;
  if (!calendarKey) {
    return NextResponse.json(
      { error: "TEAMUP_CALENDAR_KEY not configured" },
      { status: 500 }
    );
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const result = await createEvent({
    calendarKey,
    subcalendarId: room.subcalendarId,
    title: `Quick Booking (${durationMinutes} min)`,
    startDt: start.toISOString(),
    endDt: end.toISOString(),
  });

  return NextResponse.json({
    success: true,
    event: result.event,
    bookedUntil: end.toISOString(),
  });
}
```

- [ ] **Step 3: Test with curl**

Run (with dev server running):
```bash
curl -X POST http://localhost:3000/api/book \
  -H "Content-Type: application/json" \
  -d '{"slug":"blackhawks","startTime":"2025-04-15T14:30:00.000Z","durationMinutes":15}'
```

Expected: `{ "success": true, "event": {...}, "bookedUntil": "..." }` if API key is configured. If not, a 500 error about missing API key.

- [ ] **Step 4: Commit**

```bash
git add src/lib/teamup.ts src/app/api/book/route.ts && git commit -m "feat: add TeamUp booking API route"
```

---

### Task 6: Root Layout, Fonts, and Global CSS

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/app/page.tsx` (replace default)

- [ ] **Step 1: Set up root layout with fonts and viewport**

Replace `src/app/layout.tsx` with:
```tsx
import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans, Outfit } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RoomPanel",
  description: "Meeting room status display",
};

export const viewport: Viewport = {
  width: 1920,
  height: 1200,
  initialScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${dmSans.variable} ${outfit.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create global CSS with EP brand variables**

Replace `src/app/globals.css` with:
```css
:root {
  /* EP Brand Colors */
  --ep-navy: #1a1e2e;
  --ep-slate: #2a2f42;
  --ep-coral: #e05a47;
  --ep-coral-light: #e8786a;
  --ep-dark: #12151f;
  --ep-green: #2ecc71;
  --ep-red: #e74c3c;
  --ep-text: #f0ece4;
  --ep-text-dim: #8a8d9a;

  /* Gradients */
  --gradient-available: linear-gradient(135deg, #1a1e2e 0%, #2a1f2e 40%, #e05a47 100%);
  --gradient-occupied: linear-gradient(135deg, #1a1520 0%, #2a1520 40%, #4a1a1a 100%);
  --gradient-overlay: linear-gradient(135deg, #1a1e2e 0%, #1e1a28 50%, #2a1f2e 100%);

  /* Glass */
  --glass-bg: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: blur(10px);

  /* Fonts */
  --font-heading: var(--font-bebas), "Bebas Neue", sans-serif;
  --font-body: var(--font-dm-sans), "DM Sans", sans-serif;
  --font-time: var(--font-outfit), "Outfit", sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 1920px;
  height: 1200px;
  overflow: hidden;
  background: var(--ep-dark);
  color: var(--ep-text);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 3: Create root page that redirects to room list or shows index**

Replace `src/app/page.tsx` with:
```tsx
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
```

- [ ] **Step 4: Verify fonts load and styles apply**

Run `npm run dev`, open `http://localhost:3000`

Expected: Dark EP gradient background, "ROOMPANEL" heading in Bebas Neue, 6 room links in glassmorphism cards.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/app/page.tsx && git commit -m "feat: add root layout with EP brand fonts and global styles"
```

---

### Task 7: Room Panel Page and Main Component (Available State)

**Files:**
- Create: `src/app/rooms/[slug]/page.tsx`
- Create: `src/components/RoomPanel.tsx`
- Create: `src/components/StatusPill.tsx`
- Create: `src/components/MeetingCard.tsx`

- [ ] **Step 1: Create the room page (server component)**

Create `src/app/rooms/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getRoomBySlug } from "@/lib/rooms";
import RoomPanel from "@/components/RoomPanel";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const room = getRoomBySlug(slug);

  if (!room) {
    notFound();
  }

  return <RoomPanel room={room} />;
}
```

- [ ] **Step 2: Create StatusPill component**

Create `src/components/StatusPill.tsx`:
```tsx
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
```

Create `src/components/StatusPill.module.css`:
```css
.pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  border-radius: 50px;
  font-size: 20px;
  font-weight: 600;
  width: fit-content;
}

.available {
  background: rgba(46, 204, 113, 0.15);
  border: 1px solid rgba(46, 204, 113, 0.3);
  color: var(--ep-green);
}

.busy {
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.3);
  color: var(--ep-red);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dotAvailable {
  background: var(--ep-green);
  animation: pulse 2s infinite;
}

.dotBusy {
  background: var(--ep-red);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.4);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 0 8px rgba(46, 204, 113, 0);
  }
}
```

- [ ] **Step 3: Create MeetingCard component**

Create `src/components/MeetingCard.tsx`:
```tsx
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
```

Create `src/components/MeetingCard.module.css`:
```css
.card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 18px 20px;
}

.time {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
  font-family: var(--font-time);
}

.title {
  font-size: 17px;
  font-weight: 600;
}

.organizer {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 4px;
}
```

- [ ] **Step 4: Create main RoomPanel component (Available state first)**

Create `src/components/RoomPanel.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Room, RoomStatus } from "@/lib/types";
import StatusPill from "./StatusPill";
import MeetingCard from "./MeetingCard";
import styles from "./RoomPanel.module.css";

interface RoomPanelProps {
  room: Room;
}

export default function RoomPanel({ room }: RoomPanelProps) {
  const [status, setStatus] = useState<RoomStatus | null>(null);

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
```

Create `src/components/RoomPanel.module.css`:
```css
.panel {
  width: 1920px;
  height: 1200px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 80px;
  gap: 60px;
  position: relative;
  overflow: hidden;
}

.available {
  background: var(--gradient-available);
}

.occupied {
  background: var(--gradient-occupied);
}

.loading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--ep-text-dim);
}

.left {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.logoContainer {
  width: 160px;
  height: 160px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.logo {
  width: 75%;
  height: 75%;
  object-fit: contain;
}

.roomName {
  font-family: var(--font-heading);
  font-size: 72px;
  letter-spacing: 4px;
  line-height: 1;
  margin-bottom: 8px;
  font-weight: 400;
}

.roomLocation {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 40px;
}

.right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
}

.scheduleLabel {
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
}

.meetingList {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.noEvents {
  color: rgba(255, 255, 255, 0.3);
  font-size: 16px;
}

.epWatermark {
  position: absolute;
  right: 40px;
  bottom: 30px;
  width: 280px;
  height: 280px;
  opacity: 0.05;
  pointer-events: none;
}
```

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000/rooms/blackhawks`

Expected: Full 1920x1200 panel with EP gradient, team logo placeholder (will 404 until user provides logos — that's fine), room name "BLACKHAWKS", location "New Room", status pill, and upcoming meetings from the live ICS feed.

- [ ] **Step 6: Commit**

```bash
git add src/app/rooms src/components && git commit -m "feat: add room panel page with available/occupied states"
```

---

### Task 8: Current Meeting Card (Occupied State Enhancement)

**Files:**
- Create: `src/components/CurrentMeeting.tsx`
- Modify: `src/components/RoomPanel.tsx`

- [ ] **Step 1: Create CurrentMeeting component with progress bar**

Create `src/components/CurrentMeeting.tsx`:
```tsx
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
```

Create `src/components/CurrentMeeting.module.css`:
```css
.container {
  margin-top: 32px;
  background: rgba(231, 76, 60, 0.08);
  border: 1px solid rgba(231, 76, 60, 0.15);
  border-radius: 16px;
  padding: 24px;
}

.label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 3px;
  color: rgba(231, 76, 60, 0.6);
  margin-bottom: 10px;
  font-weight: 600;
}

.title {
  font-size: 24px;
  font-weight: 700;
}

.time {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 6px;
  font-family: var(--font-time);
}

.barTrack {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-top: 16px;
  overflow: hidden;
}

.barFill {
  height: 100%;
  background: linear-gradient(90deg, var(--ep-red), var(--ep-coral));
  border-radius: 4px;
  transition: width 1s ease;
}
```

- [ ] **Step 2: Add CurrentMeeting to RoomPanel**

In `src/components/RoomPanel.tsx`, add the import at the top:
```tsx
import CurrentMeeting from "./CurrentMeeting";
```

Replace the comment `{/* BookingButton and FindRoom will be added in later tasks */}` with:
```tsx
        {!isAvailable && status.currentEvent && (
          <CurrentMeeting event={status.currentEvent} />
        )}
        {/* BookingButton and FindRoom will be added in later tasks */}
```

- [ ] **Step 3: Verify occupied state in browser**

If a room currently has a meeting running, visit that room's panel URL. You should see the red "Occupied" state with the current meeting card and progress bar. If no rooms are busy, you can verify later or temporarily modify the status logic.

- [ ] **Step 4: Commit**

```bash
git add src/components/CurrentMeeting.tsx src/components/CurrentMeeting.module.css src/components/RoomPanel.tsx && git commit -m "feat: add current meeting card with progress bar"
```

---

### Task 9: Booking Button with Duration Selector

**Files:**
- Create: `src/components/BookingButton.tsx`
- Modify: `src/components/RoomPanel.tsx`

- [ ] **Step 1: Create BookingButton component**

Create `src/components/BookingButton.tsx`:
```tsx
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

  async function handleBook(minutes: number) {
    setBooking(true);
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
      }
    } finally {
      setBooking(false);
      setExpanded(false);
    }
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + 15 * 60 * 1000);

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
```

Create `src/components/BookingButton.module.css`:
```css
.bookBtn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 20px 32px;
  border-radius: 16px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  font-family: var(--font-body);
  text-align: left;
}

.bookBtn:active {
  transform: scale(0.98);
}

.bookIcon {
  font-size: 24px;
  line-height: 1;
}

.bookMain {
  display: block;
}

.bookSub {
  display: block;
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
  font-family: var(--font-time);
}

.selector {
  display: flex;
  gap: 12px;
}

.durationBtn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: white;
  padding: 18px 24px;
  border-radius: 14px;
  cursor: pointer;
  font-family: var(--font-body);
  text-align: center;
  backdrop-filter: var(--glass-blur);
}

.durationBtn:active {
  transform: scale(0.97);
  background: rgba(255, 255, 255, 0.15);
}

.durationBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.durationMain {
  display: block;
  font-size: 20px;
  font-weight: 700;
}

.durationSub {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 4px;
  font-family: var(--font-time);
}

.cancelBtn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  padding: 18px 20px;
  border-radius: 14px;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 14px;
}
```

- [ ] **Step 2: Wire BookingButton into RoomPanel**

In `src/components/RoomPanel.tsx`, add the import:
```tsx
import BookingButton from "./BookingButton";
```

Add a `handleBooked` callback and BookingConfirmation state inside the component (before the return):
```tsx
  const [bookedUntil, setBookedUntil] = useState<string | null>(null);

  function handleBooked(until: string) {
    setBookedUntil(until);
    fetchStatus(); // Refresh calendar
    setTimeout(() => setBookedUntil(null), 3000); // Clear after 3s
  }
```

Replace the comment `{/* BookingButton and FindRoom will be added in later tasks */}` with:
```tsx
        {isAvailable && (
          <div className={styles.actionRow}>
            <BookingButton roomSlug={room.slug} onBooked={handleBooked} />
          </div>
        )}
```

Add to `src/components/RoomPanel.module.css`:
```css
.actionRow {
  display: flex;
  gap: 16px;
  margin-top: 32px;
}
```

- [ ] **Step 3: Verify booking button in browser**

Open an available room panel. Tap "Book 15 min" — it should expand to show 15/30/60 options. Tapping a duration attempts the booking (will fail without a valid API key — that's expected for now).

- [ ] **Step 4: Commit**

```bash
git add src/components/BookingButton.tsx src/components/BookingButton.module.css src/components/RoomPanel.tsx src/components/RoomPanel.module.css && git commit -m "feat: add booking button with 15/30/60 duration selector"
```

---

### Task 10: Find a Room Overlay

**Files:**
- Create: `src/components/FindRoomOverlay.tsx`
- Modify: `src/components/RoomPanel.tsx`

- [ ] **Step 1: Create FindRoomOverlay component**

Create `src/components/FindRoomOverlay.tsx`:
```tsx
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
```

Create `src/components/FindRoomOverlay.module.css`:
```css
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1200px;
  background: var(--gradient-overlay);
  z-index: 100;
  padding: 60px 80px;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.title {
  font-family: var(--font-heading);
  font-size: 48px;
  letter-spacing: 3px;
  font-weight: 400;
}

.closeBtn {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
}

.closeBtn:active {
  background: rgba(255, 255, 255, 0.12);
}

.subtitle {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 48px;
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--ep-text-dim);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
  flex: 1;
}

.roomCard {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  font-family: var(--font-body);
  color: var(--ep-text);
}

.roomCard:active:not(:disabled) {
  transform: scale(0.98);
}

.roomAvailable {
  border-color: rgba(46, 204, 113, 0.2);
  background: rgba(46, 204, 113, 0.05);
}

.roomBusy {
  opacity: 0.4;
  cursor: not-allowed;
}

.current {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.1);
  background: transparent;
  opacity: 0.3;
  cursor: default;
}

.roomLogo {
  width: 72px;
  height: 72px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  overflow: hidden;
}

.roomLogoImg {
  width: 70%;
  height: 70%;
  object-fit: contain;
}

.roomName {
  font-family: var(--font-heading);
  font-size: 28px;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.roomLocation {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 14px;
}

.roomStatus {
  font-size: 14px;
  font-weight: 600;
}

.roomAvailable .roomStatus {
  color: var(--ep-green);
}

.roomBusy .roomStatus {
  color: rgba(255, 255, 255, 0.3);
}

.current .roomStatus {
  color: rgba(255, 255, 255, 0.25);
}

.tapLabel {
  margin-top: 12px;
  font-size: 12px;
  color: rgba(46, 204, 113, 0.6);
  text-transform: uppercase;
  letter-spacing: 1px;
}
```

- [ ] **Step 2: Wire FindRoomOverlay into RoomPanel**

In `src/components/RoomPanel.tsx`, add the import:
```tsx
import FindRoomOverlay from "./FindRoomOverlay";
```

Add state for showing the overlay (alongside existing state):
```tsx
  const [showFindRoom, setShowFindRoom] = useState(false);
```

Add a `handleFindRoomBook` function:
```tsx
  async function handleFindRoomBook(slug: string) {
    const startTime = new Date().toISOString();
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, startTime, durationMinutes: 15 }),
    });
    if (res.ok) {
      setShowFindRoom(false);
      fetchStatus();
    }
  }
```

Add a "Find a Room" button next to BookingButton in the `actionRow` div. Update the `isAvailable` action row:
```tsx
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
```

Add the overlay before the closing `</div>` of the panel:
```tsx
      {showFindRoom && (
        <FindRoomOverlay
          currentSlug={room.slug}
          durationMinutes={15}
          onBook={handleFindRoomBook}
          onClose={() => setShowFindRoom(false)}
        />
      )}
```

Add to `src/components/RoomPanel.module.css`:
```css
.findBtn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(224, 90, 71, 0.15);
  border: 1px solid rgba(224, 90, 71, 0.3);
  color: var(--ep-coral-light);
  padding: 20px 28px;
  border-radius: 16px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  font-family: var(--font-body);
}

.findBtn:active {
  transform: scale(0.98);
}
```

- [ ] **Step 3: Verify in browser**

Open any room panel. Tap "Find a Room" — overlay should appear with all 6 rooms, current room greyed out with "You are here", available rooms in green.

- [ ] **Step 4: Commit**

```bash
git add src/components/FindRoomOverlay.tsx src/components/FindRoomOverlay.module.css src/components/RoomPanel.tsx src/components/RoomPanel.module.css && git commit -m "feat: add find-a-room overlay with cross-room availability"
```

---

### Task 11: Booking Confirmation Overlay

**Files:**
- Create: `src/components/BookingConfirmation.tsx`
- Modify: `src/components/RoomPanel.tsx`

- [ ] **Step 1: Create BookingConfirmation component**

Create `src/components/BookingConfirmation.tsx`:
```tsx
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
      <h2 className={styles.title}>Booked</h2>
      <p className={styles.subtitle}>until {time}</p>
    </div>
  );
}
```

Create `src/components/BookingConfirmation.module.css`:
```css
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1200px;
  background: rgba(18, 21, 31, 0.9);
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(20px);
}

.checkmark {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(46, 204, 113, 0.15);
  border: 3px solid var(--ep-green);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
  color: var(--ep-green);
  margin-bottom: 32px;
}

.title {
  font-family: var(--font-heading);
  font-size: 64px;
  letter-spacing: 4px;
  font-weight: 400;
}

.subtitle {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
  font-family: var(--font-time);
}
```

- [ ] **Step 2: Wire BookingConfirmation into RoomPanel**

In `src/components/RoomPanel.tsx`, add the import:
```tsx
import BookingConfirmation from "./BookingConfirmation";
```

Add the overlay before the closing `</div>` of the panel (alongside the FindRoomOverlay):
```tsx
      {bookedUntil && <BookingConfirmation bookedUntil={bookedUntil} />}
```

- [ ] **Step 3: Verify in browser**

Trigger a booking (or temporarily set `bookedUntil` state to a future time). The confirmation overlay should appear with a green checkmark and "Booked until HH:MM", then auto-dismiss after 3 seconds.

- [ ] **Step 4: Commit**

```bash
git add src/components/BookingConfirmation.tsx src/components/BookingConfirmation.module.css src/components/RoomPanel.tsx && git commit -m "feat: add booking confirmation overlay"
```

---

### Task 12: Final Polish and Verification

**Files:**
- Modify: `src/components/RoomPanel.tsx` (clock display)
- Create: `public/logos/.gitkeep`

- [ ] **Step 1: Add live clock to panel**

In `src/components/RoomPanel.tsx`, add a clock state and effect:
```tsx
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(interval);
  }, []);
```

Add the clock display to the panel. Before the `epWatermark` img, add:
```tsx
      <div className={styles.clock}>
        {now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
      </div>
```

Add to `src/components/RoomPanel.module.css`:
```css
.clock {
  position: absolute;
  top: 48px;
  right: 80px;
  font-family: var(--font-time);
  font-size: 32px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.4);
}
```

- [ ] **Step 2: Create placeholder for logo assets**

Run:
```bash
mkdir -p public/logos && touch public/logos/.gitkeep
```

This directory is where the user will drop their team logos and EP logo.

- [ ] **Step 3: Full verification**

Run `npm run dev` and test each state:

1. Open `http://localhost:3000` — should show room index with links
2. Open `http://localhost:3000/rooms/blackhawks` — should show full panel
3. Verify: clock displays in top-right
4. Verify: status pill shows Available or Occupied
5. Verify: meeting cards show if there are events today
6. Tap "Book 15 min" — should expand to 15/30/60 selector
7. Tap "Find a Room" — overlay shows all 6 rooms
8. Close overlay with ✕ button
9. Visit an invalid slug like `/rooms/nope` — should 404

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add clock display and finalize room panel UI"
```

- [ ] **Step 6: Deploy to Vercel**

```bash
npx vercel --yes
```

Set environment variables on Vercel:
- `TEAMUP_API_KEY` — the user's TeamUp API key
- `TEAMUP_CALENDAR_KEY` — `ksbfdc4afb6ab75799`

Each Yealink panel browser should be pointed to: `https://{vercel-url}/rooms/{slug}`
