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

export interface Organization {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  timezone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAdmin {
  id: string;
  name: string;
  description: string | null;
  durationMins: number;
  priceCents: number;
  active: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BarberAdmin {
  id: string;
  name: string;
  active: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeOffAdmin {
  id: string;
  barberId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  barber: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingResult {
  message: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    phone: string | null;
    address: string | null;
    timezone: string;
  };
  adminUser: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
  };
  defaultBarber: {
    id: string;
    name: string;
  };
}
