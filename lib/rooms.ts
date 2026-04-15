import { Room } from "./types";

export const rooms: Room[] = [
  {
    slug: "blackhawks",
    name: "Blackhawks",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/14997684.ics",
    subcalendarId: 14997684,
    logo: "/logos/blackhawks.png",
  },
  {
    slug: "bruins",
    name: "Bruins",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/2488173.ics",
    subcalendarId: 2488173,
    logo: "/logos/bruins.png",
  },
  {
    slug: "maple-leafs",
    name: "Maple Leafs",
    location: "",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/4582646.ics",
    subcalendarId: 4582646,
    logo: "/logos/maple-leafs.png",
  },
  {
    slug: "red-wings",
    name: "Red Wings",
    location: "By the Window",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/2488175.ics",
    subcalendarId: 4582645,
    logo: "/logos/red-wings.png",
  },
  {
    slug: "johan-nilsson",
    name: "Johan Nilsson",
    location: "Bookable workstation",
    icsUrl: "https://ics.teamup.com/feed/ks9ij6x9n1dcou9pjz/15510123.ics",
    subcalendarId: 15510123,
    logo: "/logos/nilsson.jpg",
  }
];

export function getRoomBySlug(slug: string): Room | undefined {
  return rooms.find((r) => r.slug === slug);
}
