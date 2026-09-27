import { describe, expect, test } from "bun:test";
import { noise } from "./noise";
import { localTime, utcOffsetMinutes } from "./local-time";
import { solarElevation, sunTimes } from "./sun";
import { cloudCover, outdoorTempC, worldFor } from "./world";

const NOON_UTC_JUNE = Date.parse("2026-06-21T12:00:00Z");
const DEC_EVENING_BERLIN = Date.parse("2026-12-15T16:30:00Z");

describe("noise", () => {
  test("is deterministic and order independent", () => {
    const a = noise(4, "kitchen.light");
    noise(4, "other");
    expect(noise(4, "kitchen.light")).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(noise(5, "kitchen.light")).not.toBe(a);
  });
});

describe("localTime", () => {
  test("reads the zone, never the process", () => {
    const lt = localTime(NOON_UTC_JUNE, "America/Los_Angeles");
    expect(lt.hour).toBe(5);
    expect(lt.dateKey).toBe("2026-06-21");
    expect(localTime(NOON_UTC_JUNE, "UTC").hour).toBe(12);
    expect(localTime(NOON_UTC_JUNE, "UTC").midnightMs).toBe(Date.parse("2026-06-21T00:00:00Z"));
  });
  test("offset", () => {
    expect(utcOffsetMinutes(NOON_UTC_JUNE, "Europe/Berlin")).toBe(120);
    expect(utcOffsetMinutes(NOON_UTC_JUNE, "UTC")).toBe(0);
  });
});

describe("sun", () => {
  test("June noon at 48N on lon 0 is high, December 17:30 Berlin is dark", () => {
    expect(solarElevation(NOON_UTC_JUNE, 48, 0)).toBeGreaterThan(60);
    const berlin = worldFor("Europe/Berlin", 1, DEC_EVENING_BERLIN);
    expect(solarElevation(DEC_EVENING_BERLIN, berlin.latitude, berlin.longitude)).toBeLessThan(0);
  });
  test("rising precedes setting within a day", () => {
    const t = sunTimes(Date.parse("2026-06-21T00:00:00Z"), 48, 0);
    expect(t.risingMs).toBeLessThan(t.settingMs);
    expect((t.settingMs - t.risingMs) / 3_600_000).toBeGreaterThan(15);
  });
});

describe("world", () => {
  test("longitude follows the zone offset so solar noon is near local noon", () => {
    expect(worldFor("Europe/Berlin", 1, NOON_UTC_JUNE).longitude).toBe(30);
    expect(worldFor("UTC", 1, NOON_UTC_JUNE).latitude).toBe(48);
  });
  test("outdoor temperature is warmer at summer afternoon than winter dawn", () => {
    const w = worldFor("UTC", 1, NOON_UTC_JUNE);
    const summer = outdoorTempC(Date.parse("2026-07-15T15:00:00Z"), w);
    const winter = outdoorTempC(Date.parse("2026-01-15T06:00:00Z"), w);
    expect(summer).toBeGreaterThan(winter + 10);
    const c = cloudCover(NOON_UTC_JUNE, w);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });
  test("pinned instant is identical across process time zones", () => {
    const w = worldFor("UTC", 7, NOON_UTC_JUNE);
    const snapshot = {
      outdoorTempC: outdoorTempC(NOON_UTC_JUNE, w).toFixed(2),
      cloudCover: cloudCover(NOON_UTC_JUNE, w).toFixed(2),
      solarElevation: solarElevation(NOON_UTC_JUNE, 48, 0).toFixed(2),
    };
    expect(snapshot).toMatchSnapshot();
  });
});
