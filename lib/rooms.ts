import { Room } from "./types";

export const rooms: Room[] = [
  {
    slug: "blackhawks",
    name: "Blackhawks",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/14997684.ics",
    subcalendarId: 14997684,
    logo: "/logos/blackhawks.png",
    capacity: 6,
    locationHint: "Enter from reception, first door on the left",
  },
  {
    slug: "bruins",
    name: "Bruins",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/2488173.ics",
    subcalendarId: 2488173,
    logo: "/logos/bruins.png",
    capacity: 4,
    locationHint: "Corner room, past the kitchen",
  },
  {
    slug: "maple-leafs",
    name: "Maple Leafs",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/4582646.ics",
    subcalendarId: 4582646,
    logo: "/logos/maple-leafs.png",
    capacity: 6,
    locationHint: "Behind the kitchen area",
  },
  {
    slug: "red-wings",
    name: "Red Wings",
    location: "By the Window",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/2488175.ics",
    subcalendarId: 4582645,
    logo: "/logos/red-wings.png",
    capacity: 4,
    locationHint: "By the window, near the open office area",
  },
  {
    slug: "johan-nilsson",
    name: "Johan Nilsson",
    location: "Bookable workstation",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/15510123.ics",
    subcalendarId: 15510123,
    logo: "/logos/nilsson.jpg",
    capacity: 1,
    locationHint: "Workstation near the entrance",
  },
];

export function getRoomBySlug(slug: string): Room | undefined {
  return rooms.find((r) => r.slug === slug);
}
