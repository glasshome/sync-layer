import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { localTime } from "./local-time";

describe("localTime", () => {
  const format = spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
  afterEach(() => format.mockClear());

  it("formats an instant once however many entities ask about it", () => {
    const at = Date.UTC(2026, 8, 28, 10, 30);
    const first = localTime(at, "Europe/Berlin");
    for (let i = 0; i < 40; i++) expect(localTime(at, "Europe/Berlin")).toEqual(first);
    expect(format.mock.calls.length).toBeLessThanOrEqual(2);
    expect(first.dateKey).toBe("2026-09-28");
    expect(first.hour).toBeCloseTo(12.5);
  });
});
