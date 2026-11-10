import { useEffect, useState, type FormEvent } from "react";
import {
  createAppointment,
  getAdminAppointments,
  getAppointments,
  getBarbers,
  getServices,
  loginAdmin,
  updateAppointmentStatus
} from "./services/api";
import type { Appointment, Barber, Service } from "./types";

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const today = localDateTimeValue(new Date()).slice(0, 10);

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [adminToken, setAdminToken] = useState("");
  const [date, setDate] = useState(today);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadData(selectedDate = date, token = adminToken) {
    setLoading(true);
    try {
      const [serviceList, barberList, appointmentList] = await Promise.all([
        getServices(),
        getBarbers(),
        token ? getAdminAppointments(selectedDate, token) : getAppointments(selectedDate)
      ]);
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

  useEffect(() => {
    void loadData();
  }, [date, adminToken]);

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get("username")).trim();
    const password = String(formData.get("password"));
    setMessage("");
    setLoading(true);
    try {
      const session = await loginAdmin(username, password);
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const startsAt = new Date(String(form.get("time"))).toISOString();
    try {
      await createAppointment({
        clientName: String(form.get("clientName")),
        clientPhone: String(form.get("clientPhone")),
        serviceId: String(form.get("serviceId")),
        barberId: String(form.get("barberId")),
        startsAt
      });
      formElement.reset();
      setMessage("Turno reservado correctamente.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reservar el turno.");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">NAVAJA<span>.</span></a>
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

      <section className="content-grid">
        <form className="panel booking" onSubmit={handleSubmit}>
          <div className="section-heading">
            <span className="step">01</span>
            <div><h2>Reserva tu turno</h2><p>Completa tus datos para agendar.</p></div>
          </div>
          <label>Tu nombre<input name="clientName" required autoComplete="name" placeholder="Ej. Diego Pérez" /></label>
          <label>Teléfono<input name="clientPhone" required autoComplete="tel" placeholder="Ej. 300 123 4567" /></label>
          <div className="form-row">
            <label>Servicio<select name="serviceId" required defaultValue=""><option value="" disabled>Selecciona</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.name} · ${(service.priceCents / 100).toLocaleString("es-CO")}</option>)}
            </select></label>
            <label>Barbero<select name="barberId" required defaultValue=""><option value="" disabled>Selecciona</option>
              {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
            </select></label>
          </div>
          <label>Fecha y hora<input name="time" type="datetime-local" required min={localDateTimeValue(new Date())} /></label>
          <button type="submit">Confirmar reserva <span>↗</span></button>
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
              <label>Usuario<input name="username" required autoComplete="username" placeholder="Usuario administrador" /></label>
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
      <footer>BUEN CORTE. BUEN DÍA.</footer>
    </main>
  );
}

export default App;
