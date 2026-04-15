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
    if (entry?.type !== "VEVENT") continue;

    const vevent = entry as VEvent;
    if (!vevent.start || !vevent.end) continue;

    const start = new Date(vevent.start);
    const end = new Date(vevent.end);

    // Resolve ParameterValue<string> to a plain string
    const title =
      typeof vevent.summary === "string"
        ? vevent.summary
        : vevent.summary?.val ?? "Untitled";

    const organizer =
      typeof vevent.organizer === "string"
        ? vevent.organizer
        : vevent.organizer?.params?.CN ?? "";

    // Include events that overlap with today
    if (end > startOfDay && start < endOfDay) {
      events.push({
        title: title || "Untitled",
        start: start.toISOString(),
        end: end.toISOString(),
        organizer,
      });
    }
  }

  // Sort by start time
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return events;
}
