import { Room } from "./types";

export const rooms: Room[] = [
  {
    slug: "blackhawks",
    name: "Blackhawks",
    location: "New Room",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/14997684.ics",
    subcalendarId: 14997684,
    logo: "/logos/blackhawks.png",
  },
  {
    slug: "bruins",
    name: "Bruins",
    location: "Corner Room",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/2488173.ics",
    subcalendarId: 2488173,
    logo: "/logos/bruins.png",
  },
  {
    slug: "canadiens",
    name: "Canadiens",
    location: "The Studio",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/6317703.ics",
    subcalendarId: 6317703,
    logo: "/logos/canadiens.png",
  },
  {
    slug: "maple-leafs",
    name: "Maple Leafs",
    location: "Behind Kitchen",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582646.ics",
    subcalendarId: 4582646,
    logo: "/logos/maple-leafs.png",
  },
  {
    slug: "red-wings",
    name: "Red Wings",
    location: "By the Window",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582645.ics",
    subcalendarId: 4582645,
    logo: "/logos/red-wings.png",
  },
  {
    slug: "tre-kronor",
    name: "Tre Kronor",
    location: "The Big Room",
    icsUrl: "https://ics.teamup.com/feed/ksbfdc4afb6ab75799/4582647.ics",
    subcalendarId: 4582647,
    logo: "/logos/tre-kronor.png",
  },
];

export function getRoomBySlug(slug: string): Room | undefined {
  return rooms.find((r) => r.slug === slug);
}
