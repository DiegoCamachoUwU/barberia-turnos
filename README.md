# Gestor de turnos para barbería

Base full stack para reservar y consultar turnos. El frontend usa React, Vite y TypeScript; la API usa Express y Prisma con PostgreSQL.

## Requisitos

- Node.js 22.x
- PostgreSQL 14 o posterior

## Configuración

1. Crea una base de datos PostgreSQL llamada `barberia_turnos`.
2. En `backend`, copia `.env.example` a `.env` y ajusta `DATABASE_URL` si es necesario.
3. En `frontend`, copia `.env.example` a `.env` si la API no está en `http://localhost:3000/api/v1`.
4. Instala dependencias dentro de cada carpeta con `npm install`.
5. Configura primero `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12 caracteres) en `backend/.env`; luego, desde `backend`, ejecuta `npm run db:generate`, `npm run db:migrate` y `npm run db:seed`.
6. Inicia la API con `npm run dev` y el frontend con `npm run dev` desde sus respectivas carpetas.
7. Genera `JWT_SECRET` con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. No pongas esos secretos en el frontend ni el repositorio. La semilla guarda la contraseña con bcrypt.

## Modelo de datos y agenda

Cada servicio define su duración en minutos. Al reservar, la API guarda `startsAt` y `endsAt`, de modo que un cambio futuro en la duración del servicio no altera los turnos ya creados. La duración debe ser mayor que cero.

Los servicios, barberos y turnos pertenecen a una `Organization`; los nombres de servicios solo deben ser únicos dentro de cada negocio. La migración conserva los datos existentes dentro de `barberia-principal`. Las rutas `/:slug/...` validan que el negocio esté activo y aíslan los datos por organización. Las rutas antiguas sin slug se conservan como alias de `DEFAULT_ORGANIZATION_SLUG`; `auth`, `barberos`, `health`, `servicios` y `turnos` quedan reservados y no pueden usarse como slug.

Cada barbero tiene intervalos semanales (`WorkingHours`, con días ISO: lunes = 1, domingo = 7), excepciones por fecha (`ScheduleException`) para cierres o jornadas especiales y bloqueos puntuales (`TimeOff`). La semilla configura lunes a sábado, 09:00–18:00, sin pausas, y domingo cerrado. La API valida que la duración completa del servicio quede en un intervalo hábil y rechaza solapamientos. Las horas se interpretan con la zona horaria IANA de la organización, cuyo valor inicial es `America/Bogota`.

El modelo `StaffUser` almacena correo, hash bcrypt, rol (`ADMIN`/`BARBER`) y organización. `POST /api/v1/auth/login` emite un JWT de 8 horas; `GET /api/v1/auth/me` valida la sesión. La agenda administrativa y los cambios de estado requieren JWT de un usuario `ADMIN` y quedan limitados a su organización. El seed crea o actualiza el administrador de `ADMIN_EMAIL` usando `ADMIN_PASSWORD`.

## Despliegue gratuito en Render + Supabase + Vercel

Se requiere una cuenta en GitHub, Render, Supabase y Vercel. Sube este proyecto a un repositorio privado o público (sin `.env` ni secretos) y conecta ese repositorio a los proveedores. Esta configuración usa Vercel Hobby para el frontend, Render Free para Express y Supabase Free para PostgreSQL. Está pensada para una demostración académica o un proyecto personal, no para producción crítica: Render puede dormir la API tras 15 minutos sin tráfico y tardar alrededor de un minuto en reactivarla; Supabase pausa proyectos Free tras una semana de inactividad. Supabase Free incluye 500 MB de base de datos. Revisa las condiciones y cuotas vigentes, y no agregues un método de pago si quieres evitar cargos.

### 1. Base de datos gratuita en Supabase

1. Crea un proyecto en el plan Free de Supabase y guarda la contraseña de la base de datos en un gestor de contraseñas.
2. En **Connect**, copia la cadena de conexión **Session pooler** (IPv4, normalmente puerto `5432`). No uses la cadena directa IPv6 en Render Free.
3. Trata la cadena como un secreto. Reemplaza el marcador de contraseña en Supabase o codifica los caracteres reservados de la contraseña antes de guardarla como variable.

### 2. Frontend en Vercel

1. Importa el repositorio en Vercel y selecciona `frontend` como **Root Directory**.
2. En la configuración del proyecto, agrega la variable de entorno `VITE_API_URL` en entorno **Production** con el valor `https://<URL-DE-LA-API-EN-RENDER>/api/v1` (por ejemplo, `https://barberia-turnos-api.onrender.com/api/v1`).
3. Despliega el frontend y vuelve a desplegar tras cambiar cualquier variable de entorno.

### 3. API Express gratuita en Render

1. En Render, crea un **Blueprint** desde el mismo repositorio. El [render.yaml](./render.yaml) configura el servicio Express con plan Free; no crea una base Render de pago ni una base Render Free que expire a los 30 días.
2. Cuando Render solicite `DATABASE_URL`, pega la conexión Session pooler de Supabase. Cuando solicite `CLIENT_ORIGIN`, introduce el dominio de producción de Vercel, sin barra al final.
3. Define los secretos obligatorios en Render (variables `sync: false`, se configuran una vez):
   - `ADMIN_EMAIL`: correo del administrador inicial.
   - `ADMIN_PASSWORD`: contraseña fuerte de al menos 12 caracteres.
   - `JWT_SECRET`: Render lo genera automáticamente si no lo defines.
4. Define las variables de notificaciones post-reserva (Frente 1) según el canal que uses:
   - `NOTIFICATION_CHANNEL`: `whatsapp` o `email` (deja `none` si no usas notificaciones aún).
   - `APP_BASE_URL`: URL pública de la API, por ejemplo `https://barberia-turnos-api.onrender.com/api/v1`.
   - Si usas **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
   - Si usas **Evolution API**: `EVOLUTION_API_URL`, `EVOLUTION_API_INSTANCE`, `EVOLUTION_API_TOKEN`.
   - Si usas **Resend (email)**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
5. Render ejecuta automáticamente `npm run db:migrate:deploy` y `npm run db:seed` al iniciar, creando el esquema y el administrador inicial de `ADMIN_EMAIL`.
6. Cuando termine el despliegue, comprueba `https://<URL-DE-LA-API>/api/v1/health`. Debe responder `{"status":"ok"}`.

### 4. Estrategia anti "Cold Start" (Render Free)

Render Free suspende el servicio tras ~15 minutos sin tráfico. Para que los clientes reciban respuestas instantáneas, configura un monitor de uptime que llame al endpoint de salud cada 10-14 minutos:

**Opción A — UptimeRobot (gratis)**
1. Crea un monitor tipo **HTTP(s)**.
2. URL: `https://<URL-DE-LA-API>/api/v1/health`.
3. Intervalo: 5 o 10 minutos.
4. Umbral de respuesta esperada: `200 OK` o que el cuerpo contenga `"status":"ok"`.

**Opción B — Better Stack / Cron-Job.org**
1. Crea un job HTTP `GET` apuntando a `https://<URL-DE-LA-API>/api/v1/health`.
2. Frecuencia: cada 10 minutos (o el mínimo permitido por el plan gratuito).

**Verificación:** revisa los logs de Render y confirma que el servicio no entra en reposo entre pings. El endpoint de salud no consulta la base de datos, por lo que es ligero y seguro de llamar con frecuencia.

### 5. Migraciones y reintento de base de datos en Supabase

- `buildCommand`: `npm ci && npm run db:generate` (genera el cliente Prisma).
- `startCommand`: `npm run db:migrate:deploy && npm run db:seed && npm start` (aplica migraciones pendientes, carga el seed de la barbería principal y arranca el servidor).
- `db:seed` crea o actualiza la organización `barberia-principal`, el administrador de `ADMIN_EMAIL`, los servicios y los barberos de ejemplo. Es idempotente: volver a ejecutarlo no duplica datos.
- Para cambios de esquema futuros, crea una migración con `npm run db:migrate` en desarrollo, sube el directorio `backend/prisma/migrations` al repositorio y Render aplicará `npm run db:migrate:deploy` en el siguiente despliegue.

### 6. Verificación de salud de la base de datos

Después del despliegue inicial, valida que todo funcione:

1. **Health endpoint:** `GET /api/v1/health` → `{"status":"ok"}`.
2. **Catálogo público:** `GET /api/v1/barberia-principal/servicios` y `GET /api/v1/barberia-principal/barberos` deben devolver los datos del seed.
3. **Disponibilidad:** `GET /api/v1/barberia-principal/turnos/disponibles?barberId=<id>&serviceId=<id>&date=YYYY-MM-DD` debe devolver slots.
4. **Reserva:** desde el frontend en Vercel, reserva un turno y verifica que se cree correctamente.
5. **Administración:** inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` en **Agenda del día** y confirma que puedes cambiar estados de turno.
6. **Notificaciones:** si configuraste `NOTIFICATION_CHANNEL`, reserva un turno con correo o teléfono y verifica que llegue la confirmación (WhatsApp o Email).

La URL de Vercel debe coincidir exactamente con `CLIENT_ORIGIN`; si cambia el dominio de producción, actualiza esa variable en Render y redespliega.

## API REST

La API se sirve bajo `/api/v1`. Para operar una barbería se prefijan las rutas públicas y administrativas con `/<slug>`:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/:slug` | Nombre y zona horaria del negocio activo |
| GET | `/:slug/servicios`, `/:slug/barberos` | Catálogo aislado por barbería |
| GET | `/:slug/turnos/disponibles?barberId=...&serviceId=...&date=YYYY-MM-DD` | Slots libres para ese negocio |
| POST | `/:slug/turnos` | Reserva un turno en esa barbería |
| POST | `/:slug/auth/login` | Login de usuarios de esa barbería |
| GET | `/:slug/auth/me` | Identidad autenticada; el JWT debe corresponder al slug |
| GET | `/:slug/turnos/admin` | Agenda protegida; requiere `ADMIN` del mismo negocio |
| PATCH | `/:slug/turnos/:id/estado` | Cambia estado; requiere `ADMIN` del mismo negocio |

Las rutas sin slug documentadas abajo se mantienen temporalmente como alias de `DEFAULT_ORGANIZATION_SLUG`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API |
| GET | `/servicios` | Servicios activos |
| GET | `/barberos` | Barberos activos |
| GET | `/turnos/disponibles?barberId=...&serviceId=...&date=YYYY-MM-DD` | Inicios disponibles para el servicio, barbero y fecha indicados |
| GET | `/turnos?date=YYYY-MM-DD&timezoneOffset=300` | Agenda pública del día; no devuelve nombres ni teléfonos |
| POST | `/auth/login` | Valida correo y contraseña con bcrypt; devuelve un JWT |
| GET | `/auth/me` | Devuelve la identidad y organización del titular del JWT |
| GET | `/turnos/admin?date=YYYY-MM-DD&timezoneOffset=300` | Agenda administrativa con nombre y teléfono; requiere sesión Bearer |
| POST | `/turnos` | Reserva un turno dentro del horario del barbero y rechaza solapamientos |
| PATCH | `/turnos/:id/estado` | Requiere `Authorization: Bearer <ADMIN_API_TOKEN>`; aplica transiciones válidas |

Ejemplo de reserva:

```json
{
  "clientName": "Diego Pérez",
  "clientPhone": "3001234567",
  "barberId": "barber-andres",
  "serviceId": "id-del-servicio",
  "startsAt": "2026-11-11T15:00:00.000Z"
}
```

La API aplica CORS para `CLIENT_ORIGIN`. Accede a la tienda con `https://tu-dominio/<slug>` o `https://tu-dominio/?shop=<slug>`; el slug se utiliza en todas las peticiones del frontend. La SPA incluye rewrite para permitir recargar directamente la ruta de tienda. Inicia sesión con el correo y la contraseña de esa barbería para ver nombres y teléfonos y confirmar, cancelar o completar turnos. La vista pública nunca devuelve datos personales. Las rutas administrativas requieren un JWT firmado de 8 horas, se limitan a cinco intentos de login por IP cada 15 minutos, verifican que el usuario siga existiendo con el mismo rol y organización, y fallan cerradas si `JWT_SECRET` no está configurado. Las transiciones permitidas son `PENDING` → `CONFIRMED` o `CANCELLED`, y `CONFIRMED` → `COMPLETED` o `CANCELLED`.

El endpoint de disponibilidad responde `{ "date": "2026-11-11", "timezone": "America/Bogota", "slots": [{ "startsAt": "...Z", "endsAt": "...Z" }] }`. Los inicios se ofrecen cada 60 minutos desde el comienzo de cada intervalo hábil. Se excluyen citas `PENDING`/`CONFIRMED`, bloqueos `TimeOff`, horas pasadas y servicios que no alcancen a terminar antes del cierre. El formulario del cliente consulta y muestra estos horarios al elegir servicio, barbero y fecha; la reserva vuelve a validar el horario y los conflictos en el servidor.
