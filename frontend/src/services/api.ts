import type {
  Appointment,
  AppointmentConfirmation,
  Availability,
  Barber,
  CalendarLinks,
  NotificationResult,
  Service,
  Shop
} from "../types";

const defaultApiUrl = import.meta.env.PROD
  ? "https://barberia-turnos-api.onrender.com/api/v1"
  : "http://localhost:3000/api/v1";
const apiUrl = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/+$/, "");
const defaultShopSlug = import.meta.env.VITE_DEFAULT_SHOP_SLUG || "barberia-principal";
const reservedShopSlugs = new Set(["auth", "barberos", "health", "servicios", "turnos"]);

export function getCurrentShopSlug() {
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const queryShop = new URLSearchParams(window.location.search).get("shop");
  const pathShop = pathSegments.length === 1 && pathSegments[0] !== "index.html"
    ? pathSegments[0]
    : null;
  const slug = pathShop || queryShop || defaultShopSlug;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !reservedShopSlugs.has(slug)
    ? slug
    : defaultShopSlug;
}

function shopPath(path: string) {
  return `/${encodeURIComponent(getCurrentShopSlug())}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Error al consultar el servidor (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const getServices = () => request<Service[]>(shopPath("/servicios"));
export const getBarbers = () => request<Barber[]>(shopPath("/barberos"));
export const getShop = () => request<Shop>(shopPath(""));
export const getAvailableSlots = (barberId: string, serviceId: string, date: string) =>
  request<Availability>(
    `${shopPath("/turnos/disponibles")}?barberId=${encodeURIComponent(barberId)}&serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`
  );
export const getAppointments = (date: string) =>
  request<Appointment[]>(
    `${shopPath("/turnos")}?date=${encodeURIComponent(date)}&timezoneOffset=${new Date(`${date}T00:00:00`).getTimezoneOffset()}`
  );
export const loginAdmin = (email: string, password: string) =>
  request<{
    token: string;
    expiresIn: number;
    user: { userId: string; email: string; role: string; organizationId: string };
  }>(shopPath("/auth/login"), {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
export const getCurrentUser = (token: string) =>
  request<{ userId: string; email: string; role: string; organizationId: string }>(shopPath("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` }
  });
export const getAdminAppointments = (date: string, token: string) =>
  request<Appointment[]>(
    `${shopPath("/turnos/admin")}?date=${encodeURIComponent(date)}&timezoneOffset=${new Date(`${date}T00:00:00`).getTimezoneOffset()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
export const updateAppointmentStatus = (
  id: string,
  status: Appointment["status"],
  token: string
) =>
  request<Appointment>(shopPath(`/turnos/${encodeURIComponent(id)}/estado`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
export const createAppointment = (data: {
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  serviceId: string;
  barberId: string;
  startsAt: string;
}) =>
  request<AppointmentConfirmation>(shopPath("/turnos"), {
    method: "POST",
    body: JSON.stringify(data)
  });

export const downloadAppointmentCalendar = (id: string): Promise<Blob> => {
  const slug = getCurrentShopSlug();
  return fetch(`${apiUrl}/${encodeURIComponent(slug)}/turnos/${encodeURIComponent(id)}/calendar.ics`).then(
    (response) => {
      if (!response.ok) {
        throw new Error(`No se pudo descargar el calendario (${response.status}).`);
      }
      return response.blob();
    }
  );
};
