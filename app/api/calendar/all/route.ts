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
    })
  );

  return NextResponse.json(statuses);
}
