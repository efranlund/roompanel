import { notFound } from "next/navigation";
import { getRoomBySlug } from "@/lib/rooms";
import RoomPanel from "@/components/RoomPanel";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const room = getRoomBySlug(slug);

  if (!room) {
    notFound();
  }

  return <RoomPanel room={room} />;
}
