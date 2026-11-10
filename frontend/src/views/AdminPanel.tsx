import { useEffect, useState, type FormEvent } from "react";
import {
  getShop,
  getServicesAdmin,
  getBarbersAdmin,
  getTimeOffs,
  updateOrganization,
  createService,
  updateService,
  deleteService,
  createBarber,
  updateBarber,
  deleteBarber,
  createTimeOff,
  deleteTimeOff
} from "../services/api";
import type { Organization, ServiceAdmin, BarberAdmin, TimeOffAdmin } from "../types";

type AdminTab = "organization" | "services" | "barbers" | "timeoff";

export default function AdminPanel({ slug, token }: { slug: string; token: string }) {
  const [tab, setTab] = useState<AdminTab>("organization");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [services, setServices] = useState<ServiceAdmin[]>([]);
  const [barbers, setBarbers] = useState<BarberAdmin[]>([]);
  const [timeoffs, setTimeoffs] = useState<TimeOffAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [orgName, setOrgName] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgTimezone, setOrgTimezone] = useState("");

  const [svcName, setSvcName] = useState("");
  const [svcDesc, setSvcDesc] = useState("");
  const [svcDuration, setSvcDuration] = useState(30);
  const [svcPrice, setSvcPrice] = useState(0);
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null);

  const [barberName, setBarberName] = useState("");
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);

  const [toBarberId, setToBarberId] = useState("");
  const [toStartsAt, setToStartsAt] = useState("");
  const [toEndsAt, setToEndsAt] = useState("");
  const [toReason, setToReason] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [shop, svcList, barberList, toList] = await Promise.all([
        getShop(),
        getServicesAdmin(slug, token),
        getBarbersAdmin(slug, token),
        getTimeOffs(slug, token)
      ]);
      setOrganization(shop as unknown as Organization);
      setServices(svcList);
      setBarbers(barberList);
      setTimeoffs(toList);
      setOrgName(shop.name);
      setOrgPhone(shop.phone || "");
      setOrgAddress(shop.address || "");
      setOrgTimezone(shop.timezone);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la administración.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [slug, token]);

  async function handleOrgSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await updateOrganization(slug, {
        name: orgName || undefined,
        phone: orgPhone || null,
        address: orgAddress || null,
        timezone: orgTimezone || undefined
      });
      await loadData();
      setMessage("Datos del negocio actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el negocio.");
    }
  }

  function formatLocal(iso: string) {
    return new Date(iso).toLocaleString("es-CO", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function handleServiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (editingSvcId) {
        await updateService(slug, token, editingSvcId, {
          name: svcName || undefined,
          description: svcDesc || null,
          durationMins: svcDuration,
          priceCents: svcPrice
        });
        setEditingSvcId(null);
      } else {
        await createService(slug, token, {
          name: svcName,
          description: svcDesc || null,
          durationMins: svcDuration,
          priceCents: svcPrice
        });
      }
      setSvcName("");
      setSvcDesc("");
      setSvcDuration(30);
      setSvcPrice(0);
      await loadData();
      setMessage("Servicio guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el servicio.");
    }
  }

  async function handleToggleService(id: string, active: boolean) {
    setError("");
    try {
      await updateService(slug, token, id, { active });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado del servicio.");
    }
  }

  async function handleBarberSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (editingBarberId) {
        await updateBarber(slug, token, editingBarberId, { name: barberName });
        setEditingBarberId(null);
      } else {
        await createBarber(slug, token, { name: barberName });
      }
      setBarberName("");
      await loadData();
      setMessage("Barbero guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el barbero.");
    }
  }

  async function handleToggleBarber(id: string, active: boolean) {
    setError("");
    try {
      await updateBarber(slug, token, id, { active });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado del barbero.");
    }
  }

  async function handleTimeOffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await createTimeOff(slug, token, {
        barberId: toBarberId,
        startsAt: toStartsAt,
        endsAt: toEndsAt,
        reason: toReason || null
      });
      setToBarberId("");
      setToStartsAt("");
      setToEndsAt("");
      setToReason("");
      await loadData();
      setMessage("Bloqueo creado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el bloqueo.");
    }
  }

  if (loading) return <section className="panel admin"><p className="empty">Cargando administración…</p></section>;

  return (
    <section className="panel admin">
      <div className="section-heading">
        <span className="step">02</span>
        <div>
          <h2>Panel de administración</h2>
          <p>{organization?.name} · /{organization?.slug}</p>
        </div>
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
      {message && <p className="message" role="status">{message}</p>}
      <nav className="admin-tabs">
        <button type="button" className={tab === "organization" ? "active" : ""} onClick={() => setTab("organization")}>Negocio</button>
        <button type="button" className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}>Servicios</button>
        <button type="button" className={tab === "barbers" ? "active" : ""} onClick={() => setTab("barbers")}>Equipo</button>
        <button type="button" className={tab === "timeoff" ? "active" : ""} onClick={() => setTab("timeoff")}>Bloqueos</button>
      </nav>

      {tab === "organization" && (
        <form className="org-form" onSubmit={handleOrgSubmit}>
          <label>Nombre del negocio<input required value={orgName} onChange={(e) => setOrgName(e.target.value)} /></label>
          <label>Teléfono<input type="tel" value={orgPhone} onChange={(e) => setOrgPhone(e.target.value)} /></label>
          <label>Dirección<input value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} /></label>
          <label>Zona horaria<select required value={orgTimezone} onChange={(e) => setOrgTimezone(e.target.value)}>
            <option value="America/Bogota">America/Bogota</option>
            <option value="America/Lima">America/Lima</option>
            <option value="America/Mexico_City">America/Mexico_City</option>
            <option value="America/Argentina/Buenos_Aires">America/Argentina/Buenos_Aires</option>
            <option value="America/Santiago">America/Santiago</option>
            <option value="America/Madrid">America/Madrid</option>
          </select></label>
          <button type="submit">Guardar cambios del negocio</button>
        </form>
      )}

      {tab === "services" && (
        <>
          <form className="svc-form" onSubmit={handleServiceSubmit}>
            <label>Nombre<input required value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="Ej. Corte de cabello" /></label>
            <label>Descripción<input value={svcDesc} onChange={(e) => setSvcDesc(e.target.value)} placeholder="Descripción opcional" /></label>
            <label>Duración (min)<input type="number" min="1" required value={svcDuration} onChange={(e) => setSvcDuration(Number(e.target.value))} /></label>
            <label>Precio (centavos)<input type="number" min="0" required value={svcPrice} onChange={(e) => setSvcPrice(Number(e.target.value))} /></label>
            <button type="submit">{editingSvcId ? "Actualizar servicio" : "Crear servicio"}</button>
            {editingSvcId && <button type="button" onClick={() => setEditingSvcId(null)}>Cancelar</button>}
          </form>
          <table className="list-table">
            <thead><tr><th>Servicio</th><th>Duración</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>
                    {editingSvcId === s.id ? (
                      <input autoFocus value={svcName || s.name} onChange={(e) => setSvcName(e.target.value)} />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td>{s.durationMins} min</td>
                  <td>${(s.priceCents / 100).toLocaleString("es-CO")}</td>
                  <td>
                    <label>
                      <input type="checkbox" checked={s.active} onChange={() => void handleToggleService(s.id, !s.active)} />
                      {s.active ? "Activo" : "Inactivo"}
                    </label>
                  </td>
                  <td className="actions">
                    {editingSvcId !== s.id ? (
                      <>
                        <button type="button" onClick={() => { setSvcName(s.name); setSvcDesc(s.description || ""); setSvcDuration(s.durationMins); setSvcPrice(s.priceCents); setEditingSvcId(s.id); }}>Editar</button>
                        <button type="button" onClick={() => void handleToggleService(s.id, false)}>Desactivar</button>
                      </>
                    ) : (
                      <button type="submit">Guardar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === "barbers" && (
        <>
          <form className="barber-form" onSubmit={handleBarberSubmit}>
            <label>Nombre del barbero<input required value={barberName} onChange={(e) => setBarberName(e.target.value)} placeholder="Ej. Andrés" /></label>
            <button type="submit">{editingBarberId ? "Actualizar barbero" : "Agregar barbero"}</button>
            {editingBarberId && <button type="button" onClick={() => setEditingBarberId(null)}">Cancelar</button>}
          </form>
          <table className="list-table">
            <thead><tr><th>Barbero</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {barbers.map((b) => (
                <tr key={b.id}>
                  <td>
                    {editingBarberId === b.id ? (
                      <input autoFocus value={barberName || b.name} onChange={(e) => setBarberName(e.target.value)} />
                    ) : (
                      b.name
                    )}
                  </td>
                  <td>
                    <label>
                      <input type="checkbox" checked={b.active} onChange={() => void handleToggleBarber(b.id, !b.active)} />
                      {b.active ? "Activo" : "Inactivo"}
                    </label>
                  </td>
                  <td className="actions">
                    {editingBarberId !== b.id ? (
                      <>
                        <button type="button" onClick={() => { setBarberName(b.name); setEditingBarberId(b.id); }}>Editar</button>
                        <button type="button" onClick={() => void handleToggleBarber(b.id, false)}>Desactivar</button>
                      </>
                    ) : (
                      <button type="submit">Guardar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === "timeoff" && (
        <>
          <form className="timeoff-form" onSubmit={handleTimeOffSubmit}>
            <label>Barbero<select required value={toBarberId} onChange={(e) => setToBarberId(e.target.value)}>
              <option value="">Selecciona un barbero</option>
              {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
            <label>Inicio<input type="datetime-local" required value={toStartsAt} onChange={(e) => setToStartsAt(e.target.value)} /></label>
            <label>Fin<input type="datetime-local" required value={toEndsAt} onChange={(e) => setToEndsAt(e.target.value)} /></label>
            <label>Motivo<input value={toReason} onChange={(e) => setToReason(e.target.value)} placeholder="Ej. Almuerzo, permiso, festivo" /></label>
            <button type="submit">Crear bloqueo</button>
          </form>
          <table className="list-table">
            <thead><tr><th>Barbero</th><th>Inicio</th><th>Fin</th><th>Motivo</th><th>Acciones</th></tr></thead>
            <tbody>
              {timeoffs.map((t) => (
                <tr key={t.id}>
                  <td>{t.barber.name}</td>
                  <td>{formatLocal(t.startsAt)}</td>
                  <td>{formatLocal(t.endsAt)}</td>
                  <td>{t.reason || "—"}</td>
                  <td className="actions">
                    <button type="button" onClick={() => void deleteTimeOff(slug, token, t.id).then(() => { setMessage(""); void loadData(); })">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}