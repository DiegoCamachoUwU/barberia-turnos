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
5. Desde `backend`, ejecuta `npm run db:generate`, `npm run db:migrate` y `npm run db:seed`.
6. Inicia la API con `npm run dev` y el frontend con `npm run dev` desde sus respectivas carpetas.
7. Para habilitar cambios administrativos, configura `ADMIN_API_TOKEN` en el entorno del backend con un secreto aleatorio de al menos 32 bytes. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. No lo pongas en el frontend ni lo envíes en la URL.

## Despliegue gratuito en Render + Supabase + Vercel

Se requiere una cuenta en GitHub, Render, Supabase y Vercel. Sube este proyecto a un repositorio privado o público (sin `.env` ni secretos) y conecta ese repositorio a los proveedores. Esta configuración usa Vercel Hobby para el frontend, Render Free para Express y Supabase Free para PostgreSQL. Está pensada para una demostración académica o un proyecto personal, no para producción: Render puede dormir la API tras 15 minutos sin tráfico y tardar alrededor de un minuto en reactivarla; Supabase pausa proyectos Free tras una semana de inactividad. Supabase Free incluye 500 MB de base de datos. Revisa las condiciones y cuotas vigentes, y no agregues un método de pago si quieres evitar cargos.

### Base de datos gratuita en Supabase

1. Crea un proyecto en el plan Free de Supabase y guarda la contraseña de la base de datos en un gestor de contraseñas.
2. En **Connect**, copia la cadena de conexión **Session pooler** (IPv4, normalmente puerto `5432`). No uses la cadena directa IPv6 en Render Free.
3. Trata la cadena como un secreto. Reemplaza el marcador de contraseña en Supabase o codifica los caracteres reservados de la contraseña antes de guardarla como variable.

### Frontend en Vercel

1. Importa el repositorio en Vercel y selecciona `frontend` como **Root Directory**.
2. Despliega el frontend; su URL del API puede configurarse después.

### API Express gratuita en Render

1. En Render, crea un **Blueprint** desde el mismo repositorio. El [render.yaml](./render.yaml) configura el servicio Express con plan Free; no crea una base Render de pago ni una base Render Free que expire a los 30 días.
2. Cuando Render solicite `DATABASE_URL`, pega la conexión Session pooler de Supabase. Cuando solicite `CLIENT_ORIGIN`, introduce el dominio de producción de Vercel, sin barra al final. Render genera `ADMIN_API_TOKEN` y ejecuta la migración inicial y la carga del catálogo al iniciar.
3. Cuando termine el despliegue, comprueba `https://<URL-DE-LA-API>/api/v1/health`.
4. En Vercel, configura `VITE_API_URL` en Production con `https://<URL-DE-LA-API>/api/v1` y vuelve a desplegar.
5. Prueba cargar servicios y reservar un turno. El endpoint de agenda devuelve horarios ocupados sin nombres ni teléfonos.
6. Si necesitas cambiar estados administrativamente, copia `ADMIN_API_TOKEN` desde Render a un gestor de secretos. No lo configures en Vercel ni lo compartas con el navegador; el frontend público no implementa esas funciones.

La URL de Vercel debe coincidir exactamente con `CLIENT_ORIGIN`; si cambia el dominio de producción, actualiza esa variable en Render y redespliega. El endpoint de salud no requiere acceso a la base de datos. Para cambios de esquema futuros, crea una migración con `npm run db:migrate` en desarrollo y sube el directorio `backend/prisma/migrations` al repositorio; Render ejecutará `npm run db:migrate:deploy` al desplegar.

## API REST

La API se sirve bajo `/api/v1`:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API |
| GET | `/servicios` | Servicios activos |
| GET | `/barberos` | Barberos activos |
| GET | `/turnos?date=YYYY-MM-DD&timezoneOffset=300` | Horarios ocupados del día local; no devuelve nombres ni teléfonos |
| POST | `/turnos` | Reserva un turno y rechaza solapamientos del barbero |
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

La API aplica CORS para `CLIENT_ORIGIN`. Sin `ADMIN_API_TOKEN`, los cambios administrativos responden con error y permanecen deshabilitados; una clave ausente no expone esta operación. Las transiciones permitidas son `PENDING` → `CONFIRMED` o `CANCELLED`, y `CONFIRMED` → `COMPLETED` o `CANCELLED`.
