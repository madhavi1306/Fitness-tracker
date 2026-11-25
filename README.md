# Fitness Workout Builder & Progressive Overload Logger

Formline is the visual brand for this application. Phase 1 account registration, login, profile, and dashboard remain in place. Phase 2 adds an authenticated exercise library, workout templates, live workout logging, timers, and PostgreSQL-backed workout history. Nutrition, progress calculations, and voice features are not included in this phase.

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

5. Apply the database migrations:

```powershell
npm run db:migrate
```

Prisma creates the account and workout tables, including the exercise library, templates, sessions, and logged sets. The migration command also regenerates Prisma Client.

6. Load the built-in exercise library:

```powershell
npm run db:seed -w backend
```

The seed command is safe to run again; it adds missing built-in exercises without duplicating them.

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

### Local runtime fallback

When PostgreSQL is not installed yet, `backend/.env` may use `MEMORY_MODE=true`. This starts the complete app and seeded exercise library with temporary in-memory authentication and workout data; data resets when the backend restarts. It does not replace PostgreSQL.

To switch to PostgreSQL, set `MEMORY_MODE=false` (or remove it), set a real `DATABASE_URL`, apply migrations, seed the library, and restart `npm run dev`.

If registration or login displays a database-unavailable message, the Express API is running but cannot connect to PostgreSQL. Install/start PostgreSQL or use a reachable PostgreSQL provider, set the real `DATABASE_URL` in `backend/.env`, then run `npm run db:migrate` and restart the backend. Do not use the example URL's placeholder username/password as real credentials. A schema-not-ready response means the database is reachable but the migration has not been applied yet.

## Phase 1 API

- `POST /api/auth/register` creates a user after validating inputs and hashing the password with bcrypt. It returns a signed JWT and a safe user object.
- `POST /api/auth/login` verifies email and password, then returns a JWT and safe user object.
- `GET /api/auth/me` returns the authenticated user.
- `GET /api/profile` retrieves the authenticated user's profile.
- `PUT /api/profile` validates and updates editable profile fields for the authenticated user only.
- `GET /api/health` is a liveness check.

Authenticated requests use `Authorization: Bearer <token>`. Password hashes are never returned. Auth endpoints are rate-limited; profile and registration inputs are validated on the server.

## Phase 2 features and API

- **Exercise library** (`/app/exercises`): search and filter the built-in and personal exercise library; open instructions; create, edit, and delete custom exercises. A custom exercise cannot be deleted while a template uses it.
- **Workout builder** (`/app/workouts`): create and reorder exercise plans, set sets/reps/weight/rest/notes, edit or delete templates, and start a workout. Templates are private to their owner.
- **Live workout** (`/app/workouts/live/:id`): log each completed set, pause/resume the timer, choose 30/60/90/120-second or custom rest, skip rest, navigate exercises, and finish a session.
- **Workout history** (`/app/workouts/history`): browse completed sessions and open details with exercise, set, reps, weight, and duration.
- `GET /api/exercises?search=&muscleGroup=&equipment=` lists built-in and current-user exercises; `GET /api/exercises/:id` opens one. Authenticated `POST /api/exercises`, `PUT /api/exercises/:id`, and `DELETE /api/exercises/:id` manage custom exercises.
- `GET /api/templates`, `POST /api/templates`, `GET /api/templates/:id`, `PUT /api/templates/:id`, and `DELETE /api/templates/:id` manage only the authenticated user's templates.
- `POST /api/workouts/start` starts a session from an owned template. `POST /api/workouts/:id/sets` logs a set and `POST /api/workouts/:id/finish` finishes a session. `GET /api/workouts/history` lists completed sessions; `GET /api/workouts/:id` returns an owned session.

Workout weights are stored in kilograms; the UI converts the selected display unit. Server-side validation enforces categories, valid sets/reps, nonnegative weights, exercise membership, set limits, session ownership, and one-time set logging.

## Checks

Run the backend validation/API tests, frontend production build, and Prisma schema validation:

```powershell
npm test
npm run build
npm run db:validate -w backend
```

The automated API tests verify authentication gates and validation without requiring a database. Full data-flow testing requires PostgreSQL. With the database configured, migration applied, and seed loaded, register/sign in, browse/filter exercises, create/edit/delete a custom exercise, create/edit/delete a template, start a workout, pause/resume and log sets, use/skip rest, finish it, and open the saved history detail. Unauthenticated requests to the Phase 1 or Phase 2 APIs should return `401`.

For Prisma's interactive data browser:

```powershell
npm run db:studio
```

## Phase 1 dashboard

The existing dashboard layout and Phase 1 profile/authentication are preserved. Dashboard analytics and nutrition remain future work; Phase 2 does not fabricate workout statistics.

## GitHub Push 2

After running the checks and reviewing the changes, push this phase from the project root:

```powershell
git add README.md backend frontend
git commit -m "feat: add exercise library and live workout logging"
git push origin main
```
