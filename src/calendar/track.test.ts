import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setPrivilegedConn } from "../core/privileged-conn";
import { resetStore, state } from "../core/store";
import type { CalendarEvent } from "./types";
import { forceResubscribeCalendars, resetCalendarTracking, trackCalendarEvents } from "./track";

interface SubscribedCall {
  message: Record<string, unknown>;
  callback: (payload: { events: CalendarEvent[] }) => void;
  unsubbed: boolean;
}

/** Fake HaLink capturing calendar subscriptions. */
function makeFakeConn(opts?: { rejectSubscribe?: boolean }) {
  const subs: SubscribedCall[] = [];
  return {
    subs,
    sendMessagePromise<T>(): Promise<T> {
      return Promise.reject(new Error("unused"));
    },
    subscribeEvents(): Promise<() => void> {
      return Promise.resolve(() => {});
    },
    subscribeMessage<T>(
      callback: (message: T) => void,
      message: unknown,
    ): Promise<() => Promise<void>> {
      if (opts?.rejectSubscribe) return Promise.reject(new Error("boom"));
      const call: SubscribedCall = {
        message: message as Record<string, unknown>,
        callback: callback as SubscribedCall["callback"],
        unsubbed: false,
      };
      subs.push(call);
      return Promise.resolve(async () => {
        call.unsubbed = true;
      });
    },
  };
}

const CAL = "calendar.family";

/** track() schedules its flush on a microtask; settle it. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  resetCalendarTracking();
  resetStore();
  setPrivilegedConn(null);
});

afterEach(() => {
  resetCalendarTracking();
});

describe("trackCalendarEvents", () => {
  test("two trackers on one entity share a single upstream subscription", async () => {
    const conn = makeFakeConn();
    setPrivilegedConn(conn);

    const untrackA = trackCalendarEvents(CAL);
    const untrackB = trackCalendarEvents(CAL);
    await settle();

    expect(conn.subs.length).toBe(1);
    const msg = conn.subs[0]?.message;
    expect(msg?.type).toBe("calendar/event/subscribe");
    expect(msg?.entity_id).toBe(CAL);
    expect(typeof msg?.start).toBe("string");
    expect(typeof msg?.end).toBe("string");
    expect(new Date(msg?.start as string).getTime()).toBeLessThan(Date.now());
    expect(new Date(msg?.end as string).getTime()).toBeGreaterThan(Date.now());

    untrackA();
    untrackB();
  });

  test("initial snapshot and later pushes land in the store", async () => {
    const conn = makeFakeConn();
    setPrivilegedConn(conn);

    const untrack = trackCalendarEvents(CAL);
    await settle();

    expect(state.calendars[CAL]?.loading).toBe(true);

    const event: CalendarEvent = { start: "2026-08-11", end: "2026-08-12", summary: "Trip" };
    conn.subs[0]?.callback({ events: [event] });
    expect(state.calendars[CAL]?.events).toEqual([event]);
    expect(state.calendars[CAL]?.loading).toBe(false);

    const updated: CalendarEvent = {
      start: "2026-08-11T09:00:00+00:00",
      end: "2026-08-11T10:00:00+00:00",
      summary: "Dentist",
    };
    conn.subs[0]?.callback({ events: [event, updated] });
    expect(state.calendars[CAL]?.events.length).toBe(2);

    untrack();
  });

  test("last untrack unsubscribes upstream and clears the store", async () => {
    const conn = makeFakeConn();
    setPrivilegedConn(conn);

    const untrackA = trackCalendarEvents(CAL);
    const untrackB = trackCalendarEvents(CAL);
    await settle();

    // Force-resubscribe deliberately replaces the subscription (reconnect
    // semantics); one remaining tracker keeps the entity subscribed.
    untrackA();
    await forceResubscribeCalendars();
    expect(conn.subs.length).toBe(2);
    expect(state.calendars[CAL]).toBeDefined();

    untrackB();
    await forceResubscribeCalendars();
    expect(conn.subs.at(-1)?.unsubbed).toBe(true);
    expect(state.calendars[CAL]).toBeUndefined();
  });

  test("tracking while disconnected activates once the connection arrives", async () => {
    const untrack = trackCalendarEvents(CAL);
    await settle();

    const conn = makeFakeConn();
    setPrivilegedConn(conn);
    await forceResubscribeCalendars();

    expect(conn.subs.length).toBe(1);
    untrack();
  });

  test("a wider tracker window forces a resubscribe with the union window", async () => {
    const conn = makeFakeConn();
    setPrivilegedConn(conn);

    const untrackA = trackCalendarEvents(CAL);
    await settle();
    const firstEnd = new Date(conn.subs[0]?.message.end as string).getTime();

    const untrackB = trackCalendarEvents(CAL, { daysAhead: 120 });
    await settle();

    expect(conn.subs.length).toBe(2);
    expect(conn.subs[0]?.unsubbed).toBe(true);
    const secondEnd = new Date(conn.subs[1]?.message.end as string).getTime();
    expect(secondEnd).toBeGreaterThan(firstEnd);

    untrackA();
    untrackB();
  });

  test("subscription failure surfaces as an error in the store", async () => {
    const conn = makeFakeConn({ rejectSubscribe: true });
    setPrivilegedConn(conn);

    const untrack = trackCalendarEvents(CAL);
    await settle();
    await forceResubscribeCalendars();

    expect(state.calendars[CAL]?.error).toBeInstanceOf(Error);
    expect(state.calendars[CAL]?.loading).toBe(false);

    untrack();
  });
});
