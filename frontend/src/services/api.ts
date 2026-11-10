import type { Appointment, Barber, Service } from "../types";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

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
