import { NextResponse } from "next/server";
import { rooms } from "@/lib/rooms";
import { fetchTodayEvents } from "@/lib/ics";
import { RoomStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();

  const statuses: RoomStatus[] = await Promise.all(
    rooms.map(async (room) => {
      try {
        const events = await fetchTodayEvents(room.icsUrl);

        const currentEvent =
          events.find(
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
      } catch {
        // If a single room's ICS feed fails, show it as available with no events
        return {
          room,
          isAvailable: true,
          currentEvent: null,
          upcomingEvents: [],
          occupiedUntil: null,
        };
      }
    })
  );

  return NextResponse.json(statuses);
}
