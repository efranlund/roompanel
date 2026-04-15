import { NextResponse } from "next/server";
import { getRoomBySlug } from "@/lib/rooms";
import { fetchTodayEvents } from "@/lib/ics";
import { RoomStatus } from "@/lib/types";

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

  let events: import("@/lib/types").CalendarEvent[];
  try {
    events = await fetchTodayEvents(room.icsUrl);
  } catch {
    events = [];
  }
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
