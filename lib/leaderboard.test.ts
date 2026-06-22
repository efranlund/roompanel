import { describe, it, expect } from "vitest";
import { parseMember } from "./leaderboard";

describe("parseMember", () => {
  it("parses a JSON string member", () => {
    const m = parseMember(JSON.stringify({ name: "Eric", date: "2026-06-22", id: "a" }));
    expect(m).toEqual({ name: "Eric", date: "2026-06-22", id: "a" });
  });

  it("accepts an already-deserialized object member", () => {
    const m = parseMember({ name: "Sara", date: "2026-06-20", id: "b" });
    expect(m?.name).toBe("Sara");
  });

  it("returns null for malformed or nameless members", () => {
    expect(parseMember("not json")).toBeNull();
    expect(parseMember(JSON.stringify({ date: "x" }))).toBeNull();
    expect(parseMember(42)).toBeNull();
    expect(parseMember(null)).toBeNull();
  });
});
