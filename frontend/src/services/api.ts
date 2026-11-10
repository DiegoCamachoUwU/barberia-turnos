import type { Appointment, Barber, Service } from "../types";

const defaultApiUrl = import.meta.env.PROD
  ? "https://barberia-turnos-api.onrender.com/api/v1"
  : "http://localhost:3000/api/v1";
const apiUrl = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/+$/, "");

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

export const getServices = () => request<Service[]>("/servicios");
export const getBarbers = () => request<Barber[]>("/barberos");
export const getAppointments = (date: string) =>
  request<Appointment[]>(
    `/turnos?date=${encodeURIComponent(date)}&timezoneOffset=${new Date(`${date}T00:00:00`).getTimezoneOffset()}`
  );
export const loginAdmin = (username: string, password: string) =>
  request<{ token: string; expiresIn: number }>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
export const getAdminAppointments = (date: string, token: string) =>
  request<Appointment[]>(
    `/turnos/admin?date=${encodeURIComponent(date)}&timezoneOffset=${new Date(`${date}T00:00:00`).getTimezoneOffset()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
export const updateAppointmentStatus = (
  id: string,
  status: Appointment["status"],
  token: string
) =>
  request<Appointment>(`/turnos/${encodeURIComponent(id)}/estado`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
export const createAppointment = (data: {
  clientName: string;
  clientPhone: string;
  serviceId: string;
  barberId: string;
  startsAt: string;
}) =>
  request<Appointment>("/turnos", {
    method: "POST",
    body: JSON.stringify(data)
  });
