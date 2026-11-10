const weekdayNumbers = new Map([
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
  ["Sun", 7]
]);

function getLocalDateTime(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const minute = Number(values.hour) * 60
    + Number(values.minute)
    + Number(values.second) / 60
    + date.getUTCMilliseconds() / 60_000;

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    dayOfWeek: weekdayNumbers.get(values.weekday),
    minute
  };
}

function getLocalDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

export function isValidDateString(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateString;
}

export function addLocalDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function zonedDateTimeToDate(dateString, minute, timezone) {
  const { year, month, day } = getLocalDateParts(dateString);
  const targetWallTime = Date.UTC(year, month - 1, day, 0, minute);
  const result = new Date(targetWallTime);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = getLocalDateTime(result, timezone);
    const localParts = getLocalDateParts(local.date);
    const localMinute = Math.floor(local.minute);
    const localSecond = Math.round((local.minute - localMinute) * 60);
    const representedWallTime = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      Math.floor(localMinute / 60),
      localMinute % 60,
      localSecond
    );
    const difference = targetWallTime - representedWallTime;
    if (difference === 0) break;
    result.setTime(result.getTime() + difference);
  }

  const converted = getLocalDateTime(result, timezone);
  if (converted.date !== dateString || Math.abs(converted.minute - minute) > 0.001) {
    throw new RangeError(`La hora local no existe en la zona horaria ${timezone}.`);
  }
  return result;
}

export function getLocalDate(date, timezone) {
  return getLocalDateTime(date, timezone).date;
}

export function getLocalDayOfWeek(date, timezone) {
  return getLocalDateTime(date, timezone).dayOfWeek;
}

export function isWithinWorkingHours({ startsAt, endsAt, timezone, intervals }) {
  const start = getLocalDateTime(startsAt, timezone);
  const end = getLocalDateTime(endsAt, timezone);
  if (start.date !== end.date) return false;

  return intervals.some((interval) =>
    start.minute >= interval.startMinute && end.minute <= interval.endMinute
  );
}

export function generateAvailableSlots({
  date,
  timezone,
  intervals,
  durationMins,
  appointments,
  timeOffs,
  now = new Date(),
  stepMins = 60
}) {
  const slots = [];
  const seenStarts = new Set();

  for (const interval of intervals) {
    for (
      let startMinute = interval.startMinute;
      startMinute + durationMins <= interval.endMinute;
      startMinute += stepMins
    ) {
      const startsAt = zonedDateTimeToDate(date, startMinute, timezone);
      const endsAt = new Date(startsAt.getTime() + durationMins * 60_000);
      if (startsAt <= now || seenStarts.has(startsAt.getTime())) continue;

      const overlaps = (busyInterval) =>
        busyInterval.startsAt < endsAt && busyInterval.endsAt > startsAt;
      if (
        appointments.some(overlaps) ||
        timeOffs.some(overlaps) ||
        !isWithinWorkingHours({ startsAt, endsAt, timezone, intervals })
      ) {
        continue;
      }

      seenStarts.add(startsAt.getTime());
      slots.push({ startsAt, endsAt });
    }
  }

  return slots;
}
