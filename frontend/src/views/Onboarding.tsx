import { useState, type FormEvent } from "react";
import { registerBarbershop } from "../services/api";
import type { OnboardingResult } from "../types";

export default function Onboarding({ onComplete }: { onComplete: (slug: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Bogota");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<OnboardingResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await registerBarbershop({
        name,
        slug,
        phone: phone || null,
        address: address || null,
        timezone,
        adminEmail,
        adminPassword,
        adminPhone: adminPhone || null
      });
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la barbería.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <section className="panel onboarding success">
        <div className="section-heading">
          <span className="step">✓</span>
          <div>
            <h2>Barbería registrada</h2>
            <p>Tu negocio ha sido creado exitosamente.</p>
          </div>
        </div>
        <div className="onboarding-details">
          <p><strong>Nombre:</strong> {success.organization.name}</p>
          <p><strong>Slug:</strong> {success.organization.slug}</p>
          <p><strong>Acceso directo:</strong> /{success.organization.slug}</p>
          <p><strong>Administrador:</strong> {success.adminUser.email}</p>
        </div>
        <button type="button" onClick={() => onComplete(success.organization.slug)}>
          Ir a mi barbería
        </button>
      </section>
    );
  }

  return (
    <section className="panel onboarding">
      <div className="section-heading">
        <span className="step">01</span>
        <div>
          <h2>Registra tu barbería</h2>
          <p>Crea tu negocio en la plataforma en pocos pasos.</p>
        </div>
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>Nombre del negocio<input name="name" required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Barbería Centro" /></label>
        <label>Slug (URL de tu negocio)<input name="slug" required type="text" autoComplete="off" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Ej. barberia-centro" /><span className="hint">Solo letras minúsculas, números y guiones.</span></label>
        <label>Teléfono<input name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 300 123 4567" /></label>
        <label>Dirección<input name="address" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej. Cra 10 # 20-30" /></label>
        <label>Zona horaria<select name="timezone" required value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="America/Bogota">America/Bogota (UTC-5)</option>
          <option value="America/Lima">America/Lima (UTC-5)</option>
          <option value="America/Mexico_City">America/Mexico_City (UTC-6)</option>
          <option value="America/Argentina/Buenos_Aires">America/Argentina/Buenos_Aires (UTC-3)</option>
          <option value="America/Santiago">America/Santiago (UTC-4)</option>
          <option value="America/Madrid">America/Madrid (UTC+1)</option>
        </select></label>
        <label>Correo del administrador<input name="adminEmail" required type="email" autoComplete="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@tunegocio.com" /></label>
        <label>Contraseña del administrador (mínimo 12 caracteres)<input name="adminPassword" required type="password" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></label>
        <label>Teléfono del administrador (opcional)<input name="adminPhone" type="tel" autoComplete="tel" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="Ej. 300 987 6543" /></label>
        <button type="submit" disabled={loading}>{loading ? "Registrando…" : "Registrar barbería"}</button>
      </form>
      {success && (
        <p className="message success" role="status">{`¡Listo! Accede a tu negocio en /${success.organization.slug}`}</p>
      )}
    </section>
  );
}