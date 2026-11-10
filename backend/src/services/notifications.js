import { Prisma } from "@prisma/client";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";

function calendarPath(slug, appointmentId) {
  const base = APP_BASE_URL.replace(/\/$/, "");
  return `${base}/api/v1/${encodeURIComponent(slug)}/turnos/${encodeURIComponent(appointmentId)}/calendar.ics`;
}

export const NOTIFICATION_CHANNELS = ["whatsapp", "email", "none"];

export function resolveNotificationChannel() {
  const channel = String(process.env.NOTIFICATION_CHANNEL || "none")
    .toLowerCase()
    .trim();
  return NOTIFICATION_CHANNELS.includes(channel) ? channel : "none";
}

export function isNotificationConfigured() {
  const channel = resolveNotificationChannel();
  if (channel === "none") return false;
  if (channel === "whatsapp") {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
    ) || Boolean(
      process.env.EVOLUTION_API_URL &&
        process.env.EVOLUTION_API_INSTANCE &&
        process.env.EVOLUTION_API_TOKEN
    );
  }
  if (channel === "email") {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  }
  return false;
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(text) {
  return String(text ?? "").replace(/[\\;,\n]/g, (char) => {
    if (char === "\n") return "\\n";
    return `\\${char}`;
  });
}

export function buildCalendarEvent({ appointment, organization, barber, service }) {
  const now = new Date();
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const title = `Cita en ${organization.name} — ${service.name}`;
  const description = [
    `Servicio: ${service.name}`,
    `Barbero: ${barber.name}`,
    `Cliente: ${appointment.clientName}`,
    `Teléfono: ${appointment.clientPhone}`,
    `Estado: ${appointment.status}`,
    `Fecha y hora: ${start.toLocaleString("es-CO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: organization.timezone
    })}`,
    `Duración: ${service.durationMins} minutos`
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barberia Turnos//Calendario de citas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@barberia-turnos`,
    `DTSTAMP:${formatIcsDate(now)}Z`,
    `DTSTART:${formatIcsDate(start)}Z`,
    `DTEND:${formatIcsDate(end)}Z`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(organization.name)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

export function buildGoogleCalendarUrl({ appointment, organization, barber, service }) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita en ${organization.name} — ${service.name}`,
    dates: `${formatIcsDate(start)}/${formatIcsDate(end)}`,
    details: [
      `Servicio: ${service.name}`,
      `Barbero: ${barber.name}`,
      `Cliente: ${appointment.clientName}`,
      `Teléfono: ${appointment.clientPhone}`,
      `Estado: ${appointment.status}`,
      `Duración: ${service.durationMins} minutos`
    ].join("\n"),
    location: organization.name
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildCalendarLinks({ appointment, organization, barber, service }) {
  return {
    ics: calendarPath(organization.slug, appointment.id),
    googleCalendar: buildGoogleCalendarUrl({
      appointment,
      organization,
      barber,
      service
    })
  };
}
async function sendWhatsAppTwilio(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams();
  form.set("From", from);
  form.set("To", to.startsWith("whatsapp:") ? to : `whatsapp:${to}`);
  form.set("Body", body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Twilio respondio ${response.status}: ${text}`);
  }
  return response.json();
}

async function sendWhatsAppEvolution(to, body) {
  const rawBase = process.env.EVOLUTION_API_URL;
  const base = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
  const instance = process.env.EVOLUTION_API_INSTANCE;
  const token = process.env.EVOLUTION_API_TOKEN;
  const url = `${base}/message/sendText/${instance}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      number: to.startsWith("+") ? to : `+${to}`,
      text: body
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Evolution API respondio ${response.status}: ${text}`);
  }
  return response.json();
}

async function sendEmailResend(to, subject, html) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject,
      html
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Resend respondio ${response.status}: ${text}`);
  }
  return response.json();
}
function confirmationMessage({ appointment, organization, barber, service, calendar }) {
  const start = new Date(appointment.startsAt).toLocaleString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: organization.timezone
  });
  return [
    `¡Hola ${appointment.clientName}! Tu cita en *${organization.name}* quedó reservada.`,
    `*Servicio:* ${service.name}`,
    `*Barbero:* ${barber.name}`,
    `*Fecha y hora:* ${start}`,
    `*Estado:* ${appointment.status}`,
    `Agrega esta cita a tu calendario: ${calendar.googleCalendar}`,
    "Gracias por elegirnos. ¡Buen corte, buen día!"
  ].join("\n");
}

function confirmationHtml({ appointment, organization, barber, service, calendar }) {
  const start = new Date(appointment.startsAt).toLocaleString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: organization.timezone
  });
  return `
    <div style="font-family: system-ui, sans-serif; line-height: 1.6; color: #24211d; max-width: 600px;">
      <h2 style="color: #bd7844;">¡Tu cita está reservada! 🔨</h2>
      <p>Hola <strong>${escapeHtml(appointment.clientName)}</strong>, confirma tu reserva en <strong>${escapeHtml(
    organization.name
  )}</strong>:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 6px 0; color: #6f695f;">Servicio</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(service.name)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6f695f;">Barbero</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(barber.name)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6f695f;">Fecha y hora</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(start)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6f695f;">Estado</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(appointment.status)}</td></tr>
      </table>
      <p>
        <a href="${calendar.googleCalendar}" style="background: #24211d; color: #fff; padding: 10px 16px; border-radius: 4px; text-decoration: none;">
          Agregar a Google Calendar
        </a>
      </p>
      <p style="color: #827c72; font-size: 12px;">También puedes descargar el archivo .ics desde el enlace de confirmación de tu reserva.</p>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

export async function sendAppointmentConfirmation({
  appointment,
  organization,
  barber,
  service,
  channel: forcedChannel
}) {
  const channel = forcedChannel || resolveNotificationChannel();
  const calendar = buildCalendarLinks({
    appointment,
    organization,
    barber,
    service
  });

  const result = { channel, sent: false, provider: null, error: null, calendar };

  if (channel === "none" || !isNotificationConfigured()) {
    result.error = "Canal de notificaciones no configurado.";
    return result;
  }

  try {
    if (channel === "whatsapp") {
      const to = appointment.clientPhone;
      const body = confirmationMessage({
        appointment,
        organization,
        barber,
        service,
        calendar
      });
      if (
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ) {
        await sendWhatsAppTwilio(to, body);
        result.provider = "twilio";
      } else if (
        process.env.EVOLUTION_API_URL &&
        process.env.EVOLUTION_API_INSTANCE &&
        process.env.EVOLUTION_API_TOKEN
      ) {
        await sendWhatsAppEvolution(to, body);
        result.provider = "evolution";
      } else {
        throw new Error("No se configuraron credenciales de WhatsApp (Twilio o Evolution API).");
      }
    } else if (channel === "email") {
      const to = appointment.clientEmail;
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        throw new Error("La cita no tiene un correo electrónico válido para enviar la confirmación.");
      }
      const subject = `Confirmación de cita en ${organization.name}`;
      const html = confirmationHtml({
        appointment,
        organization,
        barber,
        service,
        calendar
      });
      await sendEmailResend(to, subject, html);
      result.provider = "resend";
    }
    result.sent = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error("[notifications] No se pudo enviar la confirmación:", result.error);
    return result;
  }
}

export const notificationSelection = {
  clientName: true,
  clientPhone: true,
  clientEmail: true,
  startsAt: true,
  endsAt: true,
  status: true
};
