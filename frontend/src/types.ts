export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMins: number;
  priceCents: number;
}

export interface Barber {
  id: string;
  name: string;
}

export interface Shop {
  name: string;
  slug: string;
  timezone: string;
}

export interface AvailableSlot {
  startsAt: string;
  endsAt: string;
}

export interface Availability {
  date: string;
  timezone: string;
  slots: AvailableSlot[];
}

export interface Appointment {
  id: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string | null;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  barber: Pick<Barber, "id" | "name">;
  service: Pick<Service, "id" | "name" | "durationMins" | "priceCents">;
}

export interface CalendarLinks {
  ics: string;
  googleCalendar: string;
}

export interface NotificationResult {
  channel: string;
  sent: boolean;
  provider: string | null;
  error: string | null;
}

export interface AppointmentConfirmation extends Omit<Appointment, "clientEmail"> {
  clientEmail?: string | null;
  calendar: CalendarLinks;
  notification: NotificationResult;
}
