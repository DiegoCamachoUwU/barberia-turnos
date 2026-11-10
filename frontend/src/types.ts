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

export interface Appointment {
  id: string;
  clientName?: string;
  clientPhone?: string;
  startsAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  barber: Pick<Barber, "id" | "name">;
  service: Pick<Service, "id" | "name" | "durationMins" | "priceCents">;
}
