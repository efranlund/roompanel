import { Redis } from "@upstash/redis";
import { ScoreEntry } from "./highscores";

const LEADERBOARD_KEY = "roompanel:leaderboard";
const MAX_ENTRIES = 50; // keep the set bounded; we only display the top 10

interface Member {
  name: string;
  date: string;
  id: string;
}

let client: Redis | null = null;

function getRedis(): Redis {
  if (!client) {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error("Leaderboard storage is not configured");
    }
    client = new Redis({ url, token });
  }
  return client;
}

// Upstash may return members as strings or, when they are valid JSON, as
// already-parsed objects. Handle both.
export function parseMember(member: unknown): Member | null {
  try {
    if (typeof member === "object" && member !== null) {
      const m = member as Partial<Member>;
      if (typeof m.name === "string" && typeof m.date === "string" && typeof m.id === "string") {
        return { name: m.name, date: m.date, id: m.id };
      }
      return null;
    }
    if (typeof member === "string") {
      const m = JSON.parse(member) as Partial<Member>;
      if (typeof m.name === "string" && typeof m.date === "string" && typeof m.id === "string") {
        return { name: m.name, date: m.date, id: m.id };
      }
    }
  } catch {
    // fall through to null for malformed members
  }
  return null;
}

export async function addScore(entry: ScoreEntry, id: string): Promise<void> {
  const redis = getRedis();
  const member: Member = { name: entry.name, date: entry.date, id };
  await redis.zadd(LEADERBOARD_KEY, { score: entry.score, member: JSON.stringify(member) });
  // drop everything below the top MAX_ENTRIES (ranks 0 .. -(MAX+1) are lowest)
  await redis.zremrangebyrank(LEADERBOARD_KEY, 0, -(MAX_ENTRIES + 1));
}

export async function getTopScores(limit = 10): Promise<ScoreEntry[]> {
  const redis = getRedis();
  // highest score first, flat [member, score, member, score, ...]
  const raw = (await redis.zrange(LEADERBOARD_KEY, 0, limit - 1, {
    rev: true,
    withScores: true,
  })) as unknown[];

  const entries: ScoreEntry[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const parsed = parseMember(raw[i]);
    const score = Number(raw[i + 1]);
    if (parsed && Number.isFinite(score)) {
      entries.push({ name: parsed.name, score, date: parsed.date });
    }
  }
  return entries;
}
