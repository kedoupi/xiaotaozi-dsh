/**
 * 5-field cron (min hour day month weekday). Ported from dsh-web task-board
 * (Apache-2.0). Day + weekday both restricted → OR. Missed ticks are the
 * caller's problem (skip, do not catch up).
 */

export interface CronSchedule {
  minutes: ReadonlySet<number>;
  hours: ReadonlySet<number>;
  days: ReadonlySet<number>;
  months: ReadonlySet<number>;
  weekdays: ReadonlySet<number>;
  dayWildcard: boolean;
  weekdayWildcard: boolean;
}

const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function isDigits(value: string): boolean {
  return /^\d+$/u.test(value);
}

function parseField(field: string, min: number, max: number, out: Set<number>): boolean {
  if (field === "*") {
    for (let value = min; value <= max; value += 1) out.add(value);
    return true;
  }
  for (const part of field.split(",")) {
    if (part === "") return false;
    const [range, stepRaw] = part.split("/");
    let low: number;
    let high: number;
    if (range === "*") {
      low = min;
      high = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-");
      if (a === "" || b === "" || !isDigits(a) || !isDigits(b)) return false;
      low = Number(a);
      high = Number(b);
    } else if (isDigits(range)) {
      low = Number(range);
      high = Number(range);
    } else {
      return false;
    }
    if (low < min || high > max || low > high) return false;
    const step = stepRaw === undefined ? 1 : isDigits(stepRaw) ? Number(stepRaw) : Number.NaN;
    if (!Number.isInteger(step) || step < 1) return false;
    for (let value = low; value <= high; value += step) out.add(value);
  }
  return true;
}

export function parseCron(expr: string): CronSchedule | undefined {
  const fields = expr.trim().split(/\s+/u);
  if (fields.length !== 5) return undefined;
  const sets: Array<Set<number>> = [];
  for (let index = 0; index < 5; index += 1) {
    const range = FIELD_RANGES[index]!;
    const set = new Set<number>();
    if (!parseField(fields[index]!, range[0], range[1], set)) return undefined;
    sets.push(set);
  }
  const weekdays = new Set<number>();
  for (const day of sets[4]!) weekdays.add(day === 7 ? 0 : day);
  return {
    minutes: sets[0]!,
    hours: sets[1]!,
    days: sets[2]!,
    months: sets[3]!,
    weekdays,
    dayWildcard: fields[2] === "*",
    weekdayWildcard: fields[4] === "*",
  };
}

export function isValidCron(expr: string): boolean {
  return parseCron(expr) !== undefined;
}

function dayCandidate(schedule: CronSchedule, date: Date): boolean {
  const dayMatches = schedule.days.has(date.getDate());
  const weekdayMatches = schedule.weekdays.has(date.getDay());
  if (schedule.dayWildcard) return weekdayMatches;
  if (schedule.weekdayWildcard) return dayMatches;
  return dayMatches || weekdayMatches;
}

function matches(schedule: CronSchedule, date: Date): boolean {
  if (!schedule.minutes.has(date.getMinutes())) return false;
  if (!schedule.hours.has(date.getHours())) return false;
  if (!schedule.months.has(date.getMonth() + 1)) return false;
  return dayCandidate(schedule, date);
}

function hasPossibleCalendarDay(schedule: CronSchedule): boolean {
  if (schedule.dayWildcard || !schedule.weekdayWildcard) return true;
  const maximumDay = new Map([
    [1, 31], [2, 29], [3, 31], [4, 30], [5, 31], [6, 30],
    [7, 31], [8, 31], [9, 30], [10, 31], [11, 30], [12, 31],
  ]);
  for (const month of schedule.months) {
    const maximum = maximumDay.get(month) ?? 0;
    if ([...schedule.days].some((day) => day <= maximum)) return true;
  }
  return false;
}

/** Next matching local-time minute strictly after `fromMs`, or undefined. */
export function nextRunAtMs(expr: string, fromMs: number): number | undefined {
  const schedule = parseCron(expr);
  if (schedule === undefined) return undefined;
  if (!hasPossibleCalendarDay(schedule)) return undefined;
  const from = new Date(fromMs);
  const limitMs = fromMs + 5 * 366 * 24 * 60 * 60 * 1000;
  const sortedMinutes = [...schedule.minutes].sort((a, b) => a - b);
  const sortedHours = [...schedule.hours].sort((a, b) => a - b);
  const sortedMonths = [...schedule.months].sort((a, b) => a - b);
  let year = from.getFullYear();
  let month = from.getMonth() + 1;
  let day = from.getDate();
  let hour = from.getHours();
  let minute = from.getMinutes() + 1;
  while (new Date(year, month - 1, 1, 0, 0, 0, 0).getTime() <= limitMs) {
    for (const candidateMonth of sortedMonths) {
      if (candidateMonth < month) continue;
      const daysInMonth = new Date(year, candidateMonth, 0).getDate();
      const dayStart = candidateMonth === month ? day : 1;
      for (let candidateDay = dayStart; candidateDay <= daysInMonth; candidateDay += 1) {
        const dayProbe = new Date(year, candidateMonth - 1, candidateDay, 0, 0, 0, 0);
        if (!dayCandidate(schedule, dayProbe)) continue;
        const hourStart = candidateMonth === month && candidateDay === day ? hour : 0;
        for (const candidateHour of sortedHours) {
          if (candidateHour < hourStart) continue;
          const minuteStart = candidateMonth === month && candidateDay === day && candidateHour === hour ? minute : 0;
          for (const candidateMinute of sortedMinutes) {
            if (candidateMinute < minuteStart) continue;
            const candidate = new Date(year, candidateMonth - 1, candidateDay, candidateHour, candidateMinute, 0, 0);
            const time = candidate.getTime();
            if (time <= fromMs) continue;
            if (time > limitMs) return undefined;
            if (matches(schedule, candidate)) return time;
          }
        }
      }
    }
    year += 1;
    month = 1;
    day = 1;
    hour = 0;
    minute = 0;
  }
  return undefined;
}
