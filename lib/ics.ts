import ical, { VEvent } from "node-ical";
import { CalendarEvent } from "./types";

function resolveTitle(vevent: VEvent): string {
  const summary =
    typeof vevent.summary === "string"
      ? vevent.summary
      : vevent.summary?.val ?? "Untitled";
  return summary || "Untitled";
}

function resolveOrganizer(vevent: VEvent): string {
  return typeof vevent.organizer === "string"
    ? vevent.organizer
    : vevent.organizer?.params?.CN ?? "";
}

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

    if (vevent.rrule) {
      // Expand recurring event into individual instances for today
      const instances = ical.expandRecurringEvent(vevent, {
        from: startOfDay,
        to: endOfDay,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
      });

      for (const instance of instances) {
        const start = new Date(instance.start);
        const end = new Date(instance.end);

        events.push({
          title: resolveTitle(instance.event),
          start: start.toISOString(),
          end: end.toISOString(),
          organizer: resolveOrganizer(instance.event),
        });
      }
    } else {
      if (!vevent.start || !vevent.end) continue;

      const start = new Date(vevent.start);
      const end = new Date(vevent.end);

      // Include non-recurring events that overlap with today
      if (end > startOfDay && start < endOfDay) {
        events.push({
          title: resolveTitle(vevent),
          start: start.toISOString(),
          end: end.toISOString(),
          organizer: resolveOrganizer(vevent),
        });
      }
    }
  }

  // Sort by start time
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return events;
}
