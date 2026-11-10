import assert from "node:assert/strict";
import test from "node:test";
import {
  generateAvailableSlots,
  getLocalDate,
  getLocalDayOfWeek,
  isValidDateString,
  isWithinWorkingHours,
  zonedDateTimeToDate
} from "../src/services/schedule.js";

const timezone = "America/Bogota";
const businessHours = [{ startMinute: 540, endMinute: 1080 }];

test("converts UTC instants to the organization's local date and weekday", () => {
  const mondayAtNine = new Date("2026-11-09T14:00:00.000Z");
  assert.equal(getLocalDate(mondayAtNine, timezone), "2026-11-09");
  assert.equal(getLocalDayOfWeek(mondayAtNine, timezone), 1);
});

test("accepts an appointment that fits entirely within business hours", () => {
  assert.equal(isWithinWorkingHours({
    startsAt: new Date("2026-11-09T14:00:00.000Z"),
    endsAt: new Date("2026-11-09T14:30:00.000Z"),
    timezone,
    intervals: businessHours
  }), true);
});

test("accepts an appointment ending at closing time", () => {
  assert.equal(isWithinWorkingHours({
    startsAt: new Date("2026-11-09T17:30:00.000Z"),
    endsAt: new Date("2026-11-09T18:00:00.000Z"),
    timezone,
    intervals: businessHours
  }), true);
});

test("rejects appointments outside working hours or across local dates", () => {
  assert.equal(isWithinWorkingHours({
    startsAt: new Date("2026-11-09T13:30:00.000Z"),
    endsAt: new Date("2026-11-09T14:00:00.000Z"),
    timezone,
    intervals: businessHours
  }), false);
  assert.equal(isWithinWorkingHours({
    startsAt: new Date("2026-11-10T04:50:00.000Z"),
    endsAt: new Date("2026-11-10T05:10:00.000Z"),
    timezone,
    intervals: businessHours
  }), false);
});

test("rejects appointments on a day without a working-hours interval", () => {
  assert.equal(isWithinWorkingHours({
    startsAt: new Date("2026-11-08T14:00:00.000Z"),
    endsAt: new Date("2026-11-08T14:30:00.000Z"),
    timezone,
    intervals: []
  }), false);
});

test("validates date-only values and converts local business times to UTC", () => {
  assert.equal(isValidDateString("2026-11-09"), true);
  assert.equal(isValidDateString("2026-02-30"), false);
  assert.equal(
    zonedDateTimeToDate("2026-11-09", 540, timezone).toISOString(),
    "2026-11-09T14:00:00.000Z"
  );
});

test("generates hourly slots and excludes active bookings and time off", () => {
  const slots = generateAvailableSlots({
    date: "2026-11-09",
    timezone,
    intervals: [{ startMinute: 540, endMinute: 780 }],
    durationMins: 30,
    appointments: [{
      startsAt: new Date("2026-11-09T15:00:00.000Z"),
      endsAt: new Date("2026-11-09T15:30:00.000Z")
    }],
    timeOffs: [{
      startsAt: new Date("2026-11-09T16:00:00.000Z"),
      endsAt: new Date("2026-11-09T16:30:00.000Z")
    }],
    now: new Date("2026-11-09T00:00:00.000Z")
  });

  assert.deepEqual(slots.map(({ startsAt }) => startsAt.toISOString()), [
    "2026-11-09T14:00:00.000Z",
    "2026-11-09T17:00:00.000Z"
  ]);
});

test("does not offer a service that would finish after closing", () => {
  const slots = generateAvailableSlots({
    date: "2026-11-09",
    timezone,
    intervals: [{ startMinute: 540, endMinute: 1080 }],
    durationMins: 90,
    appointments: [],
    timeOffs: [],
    now: new Date("2026-11-09T00:00:00.000Z")
  });

  assert.equal(slots.some(({ startsAt }) => startsAt.toISOString() === "2026-11-09T22:00:00.000Z"), false);
});
