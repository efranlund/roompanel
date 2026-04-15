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

  try {
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
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Unknown error";

    // Parse TeamUp error JSON from the message if present
    let userMessage = "Booking failed. Please try again.";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const teamupMsg = parsed?.error?.message || parsed?.error?.title;
        if (teamupMsg) {
          // Strip HTML tags from TeamUp error messages
          userMessage = teamupMsg.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        }
      } catch {
        // Use default message
      }
    }

    return NextResponse.json({ error: userMessage }, { status: 502 });
  }
}
