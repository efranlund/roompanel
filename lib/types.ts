export interface Room {
  slug: string;
  name: string;
  location: string;
  icsUrl: string;
  subcalendarId: number;
  logo: string; // path to /logos/{file}
  capacity: number; // number of seats
  locationHint: string; // directions to find the room
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
