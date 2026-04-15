# RoomPanel — Design Spec

## Overview

A web application displayed on Yealink RoomPanel Plus devices (1920x1200, landscape, 10.1" touchscreen) mounted outside 6 meeting rooms at the EliteProspects office. Each panel shows the room's live calendar status, upcoming meetings, and allows quick booking via the TeamUp API.

## Tech Stack

- **Framework**: Next.js (App Router) deployed on Vercel
- **Calendar source**: TeamUp .ics feeds (read) + TeamUp REST API (write/book)
- **Styling**: CSS with EP brand guidelines — no component library
- **Fonts**: Bebas Neue (headings), DM Sans (body), Outfit (time displays)

## Rooms

All rooms are hardcoded in a `rooms.ts` config file. Slugs are editable.

| Name | Slug | Location | ICS Feed |
|------|------|----------|----------|
| Blackhawks | `blackhawks` | New Room | `https://ics.teamup.com/feed/ksbfdc4afb6ab75799/14997684.ics` |
| Bruins | `bruins` | Corner Room | `https://ics.teamup.com/feed/ksbfdc4afb6ab75799/2488173.ics` |
| Canadiens | `canadiens` | The Studio | `https://ics.teamup.com/feed/ksbfdc4afb6ab75799/6317703.ics` |
| Maple Leafs | `maple-leafs` | Behind Kitchen | `https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582646.ics` |
| Red Wings | `red-wings` | By the Window | `https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582645.ics` |
| Tre Kronor | `tre-kronor` | The Big Room | `https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582647.ics` |

Each room has a team logo (provided as image file in `/public/logos/`).

## Routes

```
/rooms/[slug]           — Room panel UI (client component)
/api/calendar/[slug]    — Fetch + parse ICS for one room, return today's events as JSON
/api/calendar/all       — Fetch all 6 rooms in parallel, return availability summary
/api/book               — POST: create event via TeamUp API
```

## Panel States

### 1. Available

The room has no current meeting.

- **Background**: EP gradient — `linear-gradient(135deg, #1a1e2e 0%, #2a1f2e 40%, #e05a47 100%)`
- **Layout**: Two-column grid
  - **Left column**: Team logo (120x120 frosted glass container), room name (Bebas Neue 56px), location subtitle, green "Available" status pill with pulse dot
  - **Right column**: "Upcoming Today" label + up to 3 meeting cards (glassmorphism)
- **Actions**:
  - "Book 15 min" button showing exact time range (e.g., "14:32 — 14:47"). Tapping reveals a 15/30/60 minute selector. Picking a duration creates the booking.
  - "Find a Room" button opens the room finder overlay
- **EP logo**: Watermark at ~5% opacity, bottom-right corner

### 2. Occupied

The room is currently in a meeting.

- **Background**: Darker/redder gradient — `linear-gradient(135deg, #1a1520 0%, #2a1520 40%, #4a1a1a 100%)`
- **Left column**: Same identity block, but red "Occupied until HH:MM" status pill. Below: current meeting card with title, organizer, time, and a progress bar showing how far through the meeting.
- **Right column**: "Up Next" meetings
- **Actions**: "Find a Room" only (no booking — room is busy)

### 3. Find a Room Overlay

Full-screen overlay triggered by "Find a Room" button.

- **Background**: Dark EP gradient
- **Header**: "FIND A ROOM — {duration} MIN" title + close button (reflects selected duration)
- **Subtitle**: Time range being searched (e.g., "Available rooms for 14:32 — 14:47")
- **Grid**: 3x2 grid of all 6 rooms
  - Available rooms: green border, "Tap to book" label
  - Busy rooms: greyed out, "Busy until HH:MM"
  - Current room: dashed border, "You are here", non-interactive
- **Booking**: Tapping an available room books 15 min (or selected duration) immediately

### 4. Booking Confirmation

Brief success state after a booking is created.

- Checkmark with "Booked until HH:MM"
- Auto-returns to main view after 3 seconds
- Panel refreshes to show updated calendar

## Data Flow

1. **ICS polling**: Panel client polls `/api/calendar/[slug]` every 30 seconds
2. **Server parses ICS**: Fetches the TeamUp .ics URL, parses with `ical.js` or similar, filters to today's events, returns JSON
3. **Status logic**: Client compares current time against events. Inside an event → Occupied. Otherwise → Available.
4. **Find a Room**: Calls `/api/calendar/all` which fetches all 6 .ics feeds in parallel
5. **Booking**: POST to `/api/book` with `{ slug, startTime, durationMinutes }`. Server calls TeamUp REST API to create event. Returns success/failure.
6. **Auto-refresh**: Full page reload every 5 minutes as safety net for always-on panels

## Environment Variables

```
TEAMUP_API_KEY=<provided by user>
```

## Visual Design

- **Gradient**: Navy (#1a1e2e) → muted purple (#2a1f2e) → coral (#e05a47), matching the EP logo
- **Status colors**: Green (#2ecc71) available, Red (#e74c3c) occupied, Coral (#e05a47) accents
- **Cards**: `rgba(255,255,255,0.08)` background, `backdrop-filter: blur(10px)`, `1px solid rgba(255,255,255,0.08)` border
- **Typography**:
  - Room name: Bebas Neue, 56px, white, letter-spacing 3px
  - Meeting title: DM Sans, 17px, semibold
  - Time displays: Outfit, various sizes
- **Viewport**: Locked to 1920x1200 — no responsive breakpoints
- **Team logo**: User-provided images in `/public/logos/`, displayed at 120x120 in frosted glass container
- **EP logo**: SVG watermark, bottom-right, 5% opacity

## Assets Required (from user)

- [ ] 6 team logo images (PNG or SVG) → `/public/logos/`
- [ ] EP logo (PNG or SVG) → `/public/logos/ep-logo.svg`
- [ ] TeamUp API key → `TEAMUP_API_KEY` env var

## Out of Scope

- Authentication / access control
- Multiple booking durations beyond 15/30/60
- Recurring bookings
- User accounts or organizer names for ad-hoc bookings
- Responsive design for other screen sizes
- Fun touch animations (explicitly descoped)
