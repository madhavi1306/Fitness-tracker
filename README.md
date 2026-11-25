# Fitness Workout Builder & Progressive Overload Logger

Formline is the visual brand for this application. Phase 1 includes account registration, login, protected profile and dashboard pages, and a PostgreSQL-backed user record. Workout logging, nutrition, progress calculations, and voice features are intentionally not implemented yet.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 14 or newer, running locally or reachable by URL

## Project layout

- `frontend/` React, Vite, Tailwind CSS, and React Router
- `backend/` Express REST API and Prisma ORM
- `backend/prisma/` PostgreSQL schema and migrations

## Database and environment setup

1. Create a PostgreSQL database named `fitness_tracker` (or choose another name).
2. Copy `backend/.env.example` to `backend/.env`.
3. Set `DATABASE_URL` to your PostgreSQL connection string and replace `JWT_SECRET` with a random secret of at least 32 characters. Keep `.env` local; it is ignored by git.
4. From the project root, install dependencies and generate Prisma Client:

```powershell
npm install
npm run db:generate
```

5. Create the initial migration and apply it to your database:

```powershell
npm run db:migrate
```

Prisma will create the `User` table and the goal, activity-level, and dietary-preference enums. The migration command also regenerates Prisma Client.

## Run the application

Start the API and frontend together from the project root:

```powershell
npm run dev
```

- Frontend: http://localhost:5173
- API health check: http://localhost:4000/api/health

Or run them separately in two terminals:

```powershell
npm run dev -w backend
npm run dev -w frontend
```

The Vite development server proxies `/api` requests to the Express API. The backend loads its environment from `backend/.env`.

If registration or login displays a database-unavailable message, the Express API is running but cannot connect to PostgreSQL. Install/start PostgreSQL or use a reachable PostgreSQL provider, set the real `DATABASE_URL` in `backend/.env`, then run `npm run db:migrate` and restart the backend. Do not use the example URL's placeholder username/password as real credentials. A schema-not-ready response means the database is reachable but the migration has not been applied yet.

## Phase 1 API

- `POST /api/auth/register` creates a user after validating inputs and hashing the password with bcrypt. It returns a signed JWT and a safe user object.
- `POST /api/auth/login` verifies email and password, then returns a JWT and safe user object.
- `GET /api/auth/me` returns the authenticated user.
- `GET /api/profile` retrieves the authenticated user's profile.
- `PUT /api/profile` validates and updates editable profile fields for the authenticated user only.
- `GET /api/health` is a liveness check.

Authenticated requests use `Authorization: Bearer <token>`. Password hashes are never returned. Auth endpoints are rate-limited; profile and registration inputs are validated on the server.

## Checks

Run the backend validation tests and frontend production build:

```powershell
npm test
npm run build
npm run db:validate -w backend
```

The registration, login, duplicate-email, and profile API flows require PostgreSQL. With the database configured and migration applied, exercise them in the browser by registering an account, logging out, signing in again, editing the profile, then testing a bad password and a duplicate registration. A direct unauthenticated request to `/api/profile` or `/api/auth/me` should return `401`.

For Prisma's interactive data browser:

```powershell
npm run db:studio
```

## Phase 1 scope

The dashboard shows zero-state workout metrics and empty trend, activity, and PR sections. Quick actions link to phase-labeled placeholders. These areas will connect to real records in later phases; no workout or nutrition statistics are fabricated.
