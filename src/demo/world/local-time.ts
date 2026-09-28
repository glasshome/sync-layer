export interface LocalTime {
  hour: number;
  minuteOfDay: number;
  weekday: number;
  dayOfYear: number;
  dateKey: string;
  midnightMs: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Parts = ReturnType<typeof readParts>;

// One projection asks every entity about the same few instants; formatToParts is what costs.
const RECENT_LIMIT = 256;
const recent = new Map<string, Parts>();

function parts(ms: number, timeZone: string): Parts {
  const key = `${timeZone}|${ms}`;
  let p = recent.get(key);
  if (!p) {
    if (recent.size >= RECENT_LIMIT) recent.clear();
    p = readParts(ms, timeZone);
    recent.set(key, p);
  }
  return p;
}

function readParts(ms: number, timeZone: string) {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(ms)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday ?? "Sun"] ?? 0,
  };
}

export function utcOffsetMinutes(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

export function localTime(ms: number, timeZone: string): LocalTime {
  const p = parts(ms, timeZone);
  const minuteOfDay = p.hour * 60 + p.minute + p.second / 60;
  const startOfYear = Date.UTC(p.year, 0, 1);
  const dayUtc = Date.UTC(p.year, p.month - 1, p.day);
  const dateKey = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const midnightMs = dayUtc - utcOffsetMinutes(dayUtc, timeZone) * 60_000;
  return {
    hour: minuteOfDay / 60,
    minuteOfDay,
    weekday: p.weekday,
    dayOfYear: Math.round((dayUtc - startOfYear) / 86_400_000) + 1,
    dateKey,
    midnightMs,
  };
}
