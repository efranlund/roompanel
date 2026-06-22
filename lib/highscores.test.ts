import { describe, it, expect } from "vitest";
import { validateSubmission, todayStamp, MAX_NAME_LENGTH } from "./highscores";

describe("validateSubmission", () => {
  it("accepts a valid submission", () => {
    const r = validateSubmission({ name: "Eric", score: 420 });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ name: "Eric", score: 420 });
  });

  it("trims whitespace and caps name length", () => {
    const long = "x".repeat(40);
    const r = validateSubmission({ name: `  ${long}  `, score: 10 });
    expect(r.ok).toBe(true);
    expect(r.value?.name.length).toBe(MAX_NAME_LENGTH);
  });

  it("rejects an empty / whitespace name", () => {
    expect(validateSubmission({ name: "   ", score: 10 }).ok).toBe(false);
    expect(validateSubmission({ name: "", score: 10 }).ok).toBe(false);
  });

  it("rejects a missing or non-string name", () => {
    expect(validateSubmission({ score: 10 }).ok).toBe(false);
    expect(validateSubmission({ name: 5, score: 10 }).ok).toBe(false);
  });

  it("floors a float score and rejects bad scores", () => {
    expect(validateSubmission({ name: "A", score: 12.9 }).value?.score).toBe(12);
    expect(validateSubmission({ name: "A", score: -1 }).ok).toBe(false);
    expect(validateSubmission({ name: "A", score: Number.NaN }).ok).toBe(false);
    expect(validateSubmission({ name: "A", score: 9e9 }).ok).toBe(false);
    expect(validateSubmission({ name: "A", score: "10" }).ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(validateSubmission(null).ok).toBe(false);
    expect(validateSubmission("nope").ok).toBe(false);
  });
});

describe("todayStamp", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(todayStamp(new Date(2026, 5, 22, 14, 30))).toBe("2026-06-22");
    expect(todayStamp(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
