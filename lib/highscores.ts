// Pure helpers shared by the /api/highscores route and the client.
// No DOM, no Next, no Redis — safe to unit test directly.

export const MAX_NAME_LENGTH = 12;
export const MAX_SCORE = 1_000_000;

export interface ScoreEntry {
  name: string;
  score: number;
  date: string; // YYYY-MM-DD
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: { name: string; score: number };
}

export function validateSubmission(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const { name, score } = body as { name?: unknown; score?: unknown };

  if (typeof name !== "string") {
    return { ok: false, error: "name is required" };
  }
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed.length === 0) {
    return { ok: false, error: "name cannot be empty" };
  }

  if (typeof score !== "number" || !Number.isFinite(score)) {
    return { ok: false, error: "score must be a number" };
  }
  const int = Math.floor(score);
  if (int < 0 || int > MAX_SCORE) {
    return { ok: false, error: "score out of range" };
  }

  return { ok: true, value: { name: trimmed, score: int } };
}

export function todayStamp(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
