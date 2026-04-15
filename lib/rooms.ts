import { Room } from "./types";

export const rooms: Room[] = [
  
  {
    slug: "bruins",
    name: "Bruins",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/2488173.ics",
    subcalendarId: 2488173,
    logo: "/logos/bruins.png",
    capacity: 12,
    locationHint: "Corner room, near the kitchen",
  },
  {
    slug: "maple-leafs",
    name: "Maple Leafs",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/4582646.ics",
    subcalendarId: 4582646,
    logo: "/logos/maple-leafs.png",
    capacity: 6,
    locationHint: "Smaller room near the kitchen area",
  },
  {
    slug: "red-wings",
    name: "Red Wings",
    location: "By the Window",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/2488175.ics",
    subcalendarId: 4582645,
    logo: "/logos/red-wings.png",
    capacity: 4,
    locationHint: "On the left hand side of the printer room",
  },
  {
    slug: "johan-nilsson",
    name: "Johan Nilsson",
    location: "Bookable workstation",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/15510123.ics",
    subcalendarId: 15510123,
    logo: "/logos/nilsson.jpg",
    capacity: 1,
    locationHint: "Workstation near the Yazen area",
  },
];

export function getRoomBySlug(slug: string): Room | undefined {
  return rooms.find((r) => r.slug === slug);
}
