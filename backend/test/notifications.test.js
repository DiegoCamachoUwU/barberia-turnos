import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveNotificationChannel,
  isNotificationConfigured,
  buildCalendarEvent,
  buildGoogleCalendarUrl,
  buildCalendarLinks
} from "../src/services/notifications.js";

const envBackup = { ...process.env };

function withEnv(vars, callback) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    callback();
  } finally {
    for (const key of Object.keys(envBackup)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    process.env = { ...envBackup };
  }
}

const appointment = {
  id: "appt-1",
  clientName: "Diego Pérez",
  clientPhone: "+573001234567",
  clientEmail: "diego@example.com",
  startsAt: "2026-11-11T15:00:00.000Z",
  endsAt: "2026-11-11T15:30:00.000Z",
  status: "PENDING"
};
const organization = {
  id: "org-1",
  name: "Barbería principal",
  slug: "barberia-principal",
  timezone: "America/Bogota"
};
const barber = { id: "barber-1", name: "Andrés" };
const service = { id: "service-1", name: "Corte", durationMins: 30 };

test("resolveNotificationChannel defaults to none", () => {
  withEnv({ NOTIFICATION_CHANNEL: undefined }, () => {
    assert.equal(resolveNotificationChannel(), "none");
  });
});

test("resolveNotificationChannel accepts whatsapp and email", () => {
  withEnv({ NOTIFICATION_CHANNEL: "whatsapp" }, () => {
    assert.equal(resolveNotificationChannel(), "whatsapp");
  });
  withEnv({ NOTIFICATION_CHANNEL: "Email" }, () => {
    assert.equal(resolveNotificationChannel(), "email");
  });
  withEnv({ NOTIFICATION_CHANNEL: "invalid" }, () => {
    assert.equal(resolveNotificationChannel(), "none");
  });
});

test("isNotificationConfigured returns false for none", () => {
  withEnv({ NOTIFICATION_CHANNEL: "none" }, () => {
    assert.equal(isNotificationConfigured(), false);
  });
});

test("isNotificationConfigured requires WhatsApp credentials", () => {
  withEnv({ NOTIFICATION_CHANNEL: "whatsapp" }, () => {
    assert.equal(isNotificationConfigured(), false);
  });
  withEnv({
    NOTIFICATION_CHANNEL: "whatsapp",
    TWILIO_ACCOUNT_SID: "sid",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_NUMBER: "+1234567890"
  }, () => {
    assert.equal(isNotificationConfigured(), true);
  });
  withEnv({
    NOTIFICATION_CHANNEL: "whatsapp",
    EVOLUTION_API_URL: "http://evolution",
    EVOLUTION_API_INSTANCE: "instance",
    EVOLUTION_API_TOKEN: "token"
  }, () => {
    assert.equal(isNotificationConfigured(), true);
  });
});

test("isNotificationConfigured requires Resend credentials for email", () => {
  withEnv({ NOTIFICATION_CHANNEL: "email" }, () => {
    assert.equal(isNotificationConfigured(), false);
  });
  withEnv({
    NOTIFICATION_CHANNEL: "email",
    RESEND_API_KEY: "key",
    RESEND_FROM_EMAIL: "noreply@example.com"
  }, () => {
    assert.equal(isNotificationConfigured(), true);
  });
});

test("buildCalendarEvent returns a valid iCalendar", () => {
  const ics = buildCalendarEvent({ appointment, organization, barber, service });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.endsWith("END:VCALENDAR"));
  assert.ok(ics.includes("UID:appt-1@barberia-turnos"));
  assert.ok(ics.includes("SUMMARY:Cita en Barbería principal — Corte"));
  assert.ok(ics.includes("DTSTART:"));
  assert.ok(ics.includes("DTEND:"));
  assert.ok(ics.includes("DESCRIPTION:"));
  assert.ok(ics.includes("LOCATION:Barbería principal"));
});

test("buildGoogleCalendarUrl returns a Google Calendar link", () => {
  const url = buildGoogleCalendarUrl({ appointment, organization, barber, service });
  assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
  assert.ok(url.includes("action=TEMPLATE"));
  assert.ok(url.includes("text="));
  assert.ok(url.includes("dates="));
});

test("buildCalendarLinks returns ics and googleCalendar", () => {
  const links = buildCalendarLinks({ appointment, organization, barber, service });
  assert.ok(links.ics.includes("/api/v1/barberia-principal/turnos/appt-1/calendar.ics"));
  assert.ok(links.googleCalendar.startsWith("https://calendar.google.com/"));
});