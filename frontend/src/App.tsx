import { useEffect, useState, type FormEvent } from "react";
import {
  createAppointment,
  downloadAppointmentCalendar,
  getAdminAppointments,
  getAvailableSlots,
  getAppointments,
  getBarbers,
  getShop,
  getServices,
  loginAdmin,
  updateAppointmentStatus,
  getCurrentShopSlug,
  registerBarbershop
} from "./services/api";
import Onboarding from "./views/Onboarding";
import AdminPanel from "./views/AdminPanel";
import Landing from "./views/Landing";
import type {
  Appointment,
  AppointmentConfirmation,
  AvailableSlot,
  Barber,
  Service,
  Organization
} from "./types";

type AppView = "landing" | "booking" | "onboarding" | "admin";

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const today = localDateTimeValue(new Date()).slice(0, 10);

function App() {
  const [view, setView] = useState<AppView>("booking");
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [shopName, setShopName] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [adminToken, setAdminToken] = useState("");
  const [date, setDate] = useState(today);
  const [bookingDate, setBookingDate] = useState(today);
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotTimezone, setSlotTimezone] = useState("America/Bogota");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [clientEmail, setClientEmail] = useState("");
  const [confirmation, setConfirmation] = useState<AppointmentConfirmation | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  async function loadData(selectedDate = date, token = adminToken) {
    setLoading(true);
    try {
      const [shop, serviceList, barberList, appointmentList] = await Promise.all([
        getShop(),
        getServices(),
        getBarbers(),
        token ? getAdminAppointments(selectedDate, token) : getAppointments(selectedDate)
      ]);
      setShopName(shop.name);
      setServices(serviceList);
      setBarbers(barberList);
      setAppointments(appointmentList);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrgs() {
    setOrgsLoading(true);
    try {
      const token = localStorage.getItem("saas_token");
      if (!token) return;
      const resp = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1"}/saas/organizations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setOrganizations(data);
      }
    } catch {
      // Ignorar errores de lista de organizaciones
    } finally {
      setOrgsLoading(false);
    }
  }

  function handleViewChange(next: AppView) {
    setView(next);
    setMessage("");
    setConfirmation(null);
  }

  async function handleOnboardingComplete(slug: string) {
    setView("booking");
    // Forzar recarga del slug actual en el contexto de la tienda
    window.location.pathname = `/${slug}`;
  }

  useEffect(() => {
    void loadData();
  }, [date, adminToken]);

  useEffect(() => {
    setAvailableSlots([]);
    setSelectedSlot("");
    setSlotsError("");
    if (!barberId || !serviceId || !bookingDate) {
      setSlotsLoading(false);
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    getAvailableSlots(barberId, serviceId, bookingDate)
      .then((availability) => {
        if (cancelled) return;
        setAvailableSlots(availability.slots);
        setSlotTimezone(availability.timezone);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSlotsError(error instanceof Error ? error.message : "No se pudieron consultar los horarios.");
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [barberId, serviceId, bookingDate]);

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    setMessage("");
    setLoading(true);
    try {
      const session = await loginAdmin(email, password);
      const adminAppointments = await getAdminAppointments(date, session.token);
      setAppointments(adminAppointments);
      setAdminToken(session.token);
      setMessage("");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo validar el acceso administrativo.");
    } finally {
      setLoading(false);
    }
  }

  function handleAdminLogout() {
    setAdminToken("");
    setMessage("");
  }

  async function handleStatusChange(id: string, status: Appointment["status"]) {
    setMessage("");
    try {
      await updateAppointmentStatus(id, status, adminToken);
      await loadData(date, adminToken);
      setMessage("Estado del turno actualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el estado del turno.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setConfirmation(null);
    if (!selectedSlot) {
      setMessage("Selecciona uno de los horarios disponibles.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("clientEmail") || "").trim();
    try {
      const result = await createAppointment({
        clientName: String(form.get("clientName")),
        clientPhone: String(form.get("clientPhone")),
        clientEmail: email || null,
        serviceId,
        barberId,
        startsAt: selectedSlot
      });
      formElement.reset();
      setClientEmail("");
      await loadData();
      setServiceId("");
      setBarberId("");
      setBookingDate(today);
      setSelectedSlot("");
      setConfirmation(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reservar el turno.");
    }
  }

  function handleNewBooking() {
    setConfirmation(null);
    setMessage("");
  }

  const currentSlug = getCurrentShopSlug();

  return (
    <main className="shell">
      {view === "landing" ? (
        <>
          <header className="topbar">
            <a className="brand" href="/">Barbería Turnos<span>.</span></a>
            <span className="tagline">PLATAFORMA DE TURNOS ONLINE</span>
          </header>
          <Landing shops={organizations} onSelect={(slug) => { setView("booking"); window.location.pathname = `/${slug}`; }} />
        </>
      ) : view === "onboarding" ? (
        <>
          <header className="topbar">
            <a className="brand" href="/" onClick={() => handleViewChange("landing")}>Barbería Turnos<span>.</span></a>
            <span className="tagline">ONBOARDING SAAS</span>
          </header>
          <Onboarding onComplete={handleOnboardingComplete} />
        </>
      ) : view === "admin" ? (
        <>
          <header className="topbar">
            <a className="brand" href="/" onClick={() => handleViewChange("landing")}>Barbería Turnos<span>.</span></a>
            <span className="tagline">PANEL DE ADMINISTRACIÓN</span>
          </header>
          <AdminPanel slug={currentSlug} token={adminToken} />
        </>
      ) : (
        <>
          <header className="topbar">
            <a className="brand" href={`/${currentSlug}`}>{shopName || currentSlug}<span>.</span></a>
            <span className="tagline">BARBERÍA · TURNOS ONLINE</span>
          </header>

      <section className="hero">
        <div>
          <p className="eyebrow">TU PRÓXIMO CORTE EMPIEZA AQUÍ</p>
          <h1>Reserva tu<br /><em>momento.</em></h1>
          <p className="intro">Elige tu servicio, barbero y horario. Nosotros nos encargamos del resto.</p>
        </div>
        <div className="hero-mark" aria-hidden="true">✳</div>
      </section>

      {confirmation ? (
        <section className="panel confirmation">
          <div className="section-heading">
            <span className="step">03</span>
            <div>
              <h2>Turno reservado</h2>
              <p>Tu cita quedó confirmada. Aquí tienes los detalles y el enlace para tu calendario.</p>
            </div>
          </div>
          <div className="confirmation-details">
            <p><strong>Cliente:</strong> {confirmation.clientName}</p>
            <p><strong>Teléfono:</strong> {confirmation.clientPhone || "—"}</p>
            {confirmation.clientEmail && <p><strong>Correo:</strong> {confirmation.clientEmail}</p>}
            <p><strong>Servicio:</strong> {confirmation.service.name} · {confirmation.service.durationMins} min</p>
            <p><strong>Barbero:</strong> {confirmation.barber.name}</p>
            <p>
              <strong>Fecha y hora:</strong>{" "}
              {new Date(confirmation.startsAt).toLocaleString("es-CO", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </p>
            <p><strong>Estado:</strong> {confirmation.status}</p>
          </div>
          <div className="confirmation-actions">
            <button
              type="button"
              onClick={() =>
                void downloadAppointmentCalendar(confirmation.id).then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `cita-${confirmation.id}.ics`;
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              Descargar .ics
            </button>
            <a
              href={confirmation.calendar.googleCalendar}
              target="_blank"
              rel="noopener noreferrer"
              className="confirm-action"
            >
              Agregar a Google Calendar
            </a>
          </div>
          <p className="confirmation-notice" role="status">
            Notificación:{" "}
            {confirmation.notification.sent
              ? `Enviada por ${confirmation.notification.channel}.`
              : `No se pudo enviar (${confirmation.notification.error || "canal no configurado"}).`}
          </p>
          <button type="button" onClick={handleNewBooking}>
            Reservar otro turno
          </button>
        </section>
      ) : (
        <section className="content-grid">
        <form className="panel booking" onSubmit={handleSubmit}>
          <div className="section-heading">
            <span className="step">01</span>
            <div><h2>Reserva tu turno</h2><p>Completa tus datos para agendar.</p></div>
          </div>
          <label>Tu nombre<input name="clientName" required autoComplete="name" placeholder="Ej. Diego Pérez" /></label>
          <label>Teléfono<input name="clientPhone" required autoComplete="tel" placeholder="Ej. 300 123 4567" /></label>
          <label>Correo electrónico (opcional)<input name="clientEmail" type="email" autoComplete="email" placeholder="ejemplo@correo.com" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} /></label>
          <div className="form-row">
            <label>Servicio<select name="serviceId" required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="" disabled>Selecciona</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMins} min · ${(service.priceCents / 100).toLocaleString("es-CO")}</option>)}
            </select></label>
            <label>Barbero<select name="barberId" required value={barberId} onChange={(event) => setBarberId(event.target.value)}><option value="" disabled>Selecciona</option>
              {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
            </select></label>
          </div>
          <label>Fecha<input name="date" type="date" required min={today} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} /></label>
          <div className="slot-picker" aria-live="polite">
            <span className="slot-label">Horarios disponibles</span>
            {!serviceId || !barberId ? (
              <p className="slot-hint">Selecciona un servicio y un barbero para consultar los horarios.</p>
            ) : slotsLoading ? (
              <p className="slot-hint">Buscando horarios disponibles…</p>
            ) : slotsError ? (
              <p className="slot-error" role="alert">{slotsError}</p>
            ) : availableSlots.length === 0 ? (
              <p className="slot-hint">No hay horarios disponibles para esta fecha.</p>
            ) : (
              <div className="slot-list" role="group" aria-label="Horarios disponibles">
                {availableSlots.map((slot) => (
                  <button
                    className={`slot-option${selectedSlot === slot.startsAt ? " selected" : ""}`}
                    type="button"
                    key={slot.startsAt}
                    aria-pressed={selectedSlot === slot.startsAt}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                  >
                    {new Intl.DateTimeFormat("es-CO", {
                      timeZone: slotTimezone,
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23"
                    }).format(new Date(slot.startsAt))}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" disabled={!selectedSlot || slotsLoading}>Confirmar reserva <span>↗</span></button>
          {message && <p className="message" role="status">{message}</p>}
        </form>

        <section className="panel agenda">
          <div className="section-heading">
            <span className="step">02</span>
            <div><h2>Agenda del día</h2><p>Consulta los turnos reservados.</p></div>
          </div>
          <label>Selecciona una fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          {adminToken ? (
            <div className="admin-access">
              <span className="admin-label">Vista administrativa activa</span>
              <button className="admin-logout" type="button" onClick={handleAdminLogout}>Cerrar sesión administrativa</button>
            </div>
          ) : (
            <form className="admin-access" onSubmit={handleAdminLogin}>
              <span className="admin-label">Acceso administrativo</span>
              <label>Correo<input name="email" type="email" required autoComplete="username" placeholder="admin@barberia.com" /></label>
              <label>Contraseña<input name="password" type="password" required autoComplete="current-password" placeholder="Contraseña" /></label>
              <button className="admin-login" type="submit">Ingresar al modo admin</button>
            </form>
          )}
          {loading ? <p className="empty">Cargando agenda…</p> : appointments.length === 0 ? (
            <p className="empty">Aún no hay turnos para esta fecha.</p>
          ) : (
            <ul className="appointment-list">
              {appointments.map((appointment) => (
                <li key={appointment.id}>
                  <time>{new Date(appointment.startsAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</time>
                  <div>
                    <strong>{appointment.clientName || "Turno reservado"}</strong>
                    {appointment.clientPhone && <span>{appointment.clientPhone}</span>}
                    <span>{appointment.service.name} · {appointment.barber.name}</span>
                  </div>
                  <span className={`status ${appointment.status.toLowerCase()}`}>{appointment.status === "PENDING" ? "Pendiente" : appointment.status === "CONFIRMED" ? "Confirmado" : appointment.status === "COMPLETED" ? "Completado" : "Cancelado"}</span>
                  {adminToken && (
                    <div className="appointment-actions">
                      {appointment.status === "PENDING" && (
                        <>
                          <button type="button" onClick={() => void handleStatusChange(appointment.id, "CONFIRMED")}>Confirmar</button>
                          <button type="button" onClick={() => void handleStatusChange(appointment.id, "CANCELLED")}>Cancelar</button>
                        </>
                      )}
                      {appointment.status === "CONFIRMED" && (
                        <>
                          <button type="button" onClick={() => void handleStatusChange(appointment.id, "COMPLETED")}>Completar</button>
                          <button type="button" onClick={() => void handleStatusChange(appointment.id, "CANCELLED")}>Cancelar</button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        </section>
        )}
        </>
      )}
      <footer>BUEN CORTE. BUEN DÍA.</footer>
    </main>
  );
}

export default App;
