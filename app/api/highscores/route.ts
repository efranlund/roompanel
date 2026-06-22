import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { validateSubmission, todayStamp, ScoreEntry, LEADERBOARD_SIZE } from "@/lib/highscores";
import { addScore, getTopScores } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scores = await getTopScores(LEADERBOARD_SIZE);
    return NextResponse.json({ scores });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ scores: [], error: detail }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateSubmission(body);
  if (!result.ok || !result.value) {
    return NextResponse.json({ error: result.error ?? "Invalid submission" }, { status: 400 });
  }

  const entry: ScoreEntry = {
    name: result.value.name,
    score: result.value.score,
    date: todayStamp(new Date()),
  };

  try {
    await addScore(entry, randomUUID());
    const scores = await getTopScores(LEADERBOARD_SIZE);
    const idx = scores.findIndex(
      (s) => s.name === entry.name && s.score === entry.score && s.date === entry.date
    );
    return NextResponse.json({ scores, rank: idx === -1 ? null : idx + 1 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Could not save score", detail }, { status: 503 });
  }
}
