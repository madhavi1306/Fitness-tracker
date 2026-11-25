# Fitness Workout Builder & Progressive Overload Logger

Formline is the visual brand for this application. Phase 1 account registration, login, and profile remain in place. Phase 2 adds the authenticated exercise library, workout templates, live workout logging, timers, and workout history. Phase 3 adds workout analytics, personal records, progress charts, and body-weight tracking. Phase 4 adds food search, daily meal logging, nutrition estimates, and goal-aware suggestions. Voice features are not included.

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

Prisma creates the account and workout tables, including the exercise library, templates, sessions, logged sets, personal records, body-weight history, food library, nutrition targets, and food logs. The migration command also regenerates Prisma Client.

6. Load the built-in exercise library:

```powershell
npm run db:seed -w backend
```

The seed command is safe to run again; it adds missing built-in exercises and approximate food entries without duplicating them.

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

When PostgreSQL is not installed yet, `backend/.env` may use `MEMORY_MODE=true`. This starts the complete app and seeded exercise and food libraries with temporary in-memory authentication, workout, and nutrition data; data resets when the backend restarts. It does not replace PostgreSQL.

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

## Phase 3 progress and analytics

- The dashboard and `/app/progress` use completed workout records, not placeholder statistics. The date-range selector supports This Week, This Month, Last 30 Days, and All Time. The kg/lbs selector changes displayed values; workout and body-weight values remain stored in kilograms.
- Volume is `weight × reps` for each completed set, summed for the selected time period, day, exercise, or muscle group. Estimated 1RM uses the Epley formula: `weight × (1 + reps / 30)`.
- Logging a completed set checks for four PR types: maximum weight, estimated 1RM, maximum reps at the same weight, and exercise volume. New records are saved and surfaced in the live workout and progress view.
- The dashboard includes workout/volume/PR/streak cards, weekday volume, strength progression, muscle-group split, recent workouts, and recent PRs. Overall Progress includes workout totals, strength and exercise-volume trends, PR history, weekly summary, and body-weight history.
- Body-weight entries can be added or updated for a date from `/app/progress`; starting weight is kept separately from subsequent weigh-ins.

Authenticated API endpoints:

- `GET /api/progress/dashboard?range=thisWeek`
- `GET /api/progress/weekly-volume?range=thisWeek`
- `GET /api/progress/strength?range=thisWeek`
- `GET /api/progress/muscle-split?range=thisWeek`
- `GET /api/progress/records?range=thisWeek`
- `GET /api/progress/overall?range=thisWeek`
- `POST /api/weight` records or updates a dated weigh-in; `GET /api/weight/history` retrieves the user's history.

The supported range values are `thisWeek`, `thisMonth`, `last30Days`, and `allTime`. Every endpoint is scoped to the authenticated user. Run the migrations before using PostgreSQL mode so the personal-record and weight-history tables exist.

## Phase 4 nutrition and goal modes

- `/app/diet` is the Nutrition page. Search the built-in Indian food library, log servings by meal, edit quantity/meal, delete entries, review the last 30 days, create personal foods, and add suggested foods or meal combinations. The dashboard and profile also show nutrition targets.
- The seed includes approximate values for eggs, chapati, cooked rice, dal, milk, curd, paneer, banana, chicken, chickpeas, idli, dosa, upma, oats, vegetables, fruits, tofu, and other common foods. Nutrients are values per listed serving, and a log quantity scales calories, protein, carbohydrate, and fat. Each log stores a nutrient snapshot so later food-library changes do not rewrite history.
- Calories use a sex-neutral Mifflin-style estimate: `BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 78`, floored at 1,200 kcal, then multiplied by the selected activity factor (1.2–1.9). Goal adjustments are modest: +200 kcal for gain, −300 kcal for loss (not below estimated BMR), no change for maintenance, and +100 kcal for strength. Users under 18 receive no goal-based calorie adjustment and see a professional-guidance note.
- Protein estimates use 1.4 g/kg for maintenance, 1.6 g/kg for gain, and 1.8 g/kg for weight loss or strength. Fat is estimated at 28% of target calories; carbohydrates use the remaining calories after protein and fat. These values are estimates, not medical advice. They do not account for individual medical needs, and the UI cautions against extreme restriction.
- Food values are approximate and vary by recipe, brand, and serving size. For example, 2 eggs + 2 chapatis + 1 bowl of dal is estimated at 564 kcal, 29.6 g protein, 62.8 g carbs, and 20.6 g fat.
- Weight gain/loss progress uses the profile's starting and target weight plus recorded weigh-ins. Food suggestions filter by dietary preference and prioritize remaining protein/calorie needs; meal suggestions are optional balanced combinations.

Authenticated API endpoints:

- `GET /api/foods` and `GET /api/foods/search?search=dal` list/search built-in foods and the current user's custom foods; `POST /api/foods` creates a custom food with per-serving values.
- `GET /api/nutrition/today?date=YYYY-MM-DD` returns that day's logs, nutrition totals, targets, remaining amounts, and suggestions.
- `POST /api/nutrition/food` creates a log; `PUT /api/nutrition/food/:id` updates an owned log; `DELETE /api/nutrition/food/:id` removes an owned log.
- `GET /api/nutrition/history?from=YYYY-MM-DD&to=YYYY-MM-DD` returns the user's food history (defaults to the last 30 days).
- `GET /api/nutrition/targets` reads or calculates targets from the profile. `POST /api/nutrition/targets` recalculates when sent an empty object, or saves validated custom targets.

The new Prisma migration is `20261125030000_nutrition_tracking`. Apply migrations and rerun the seed command when switching to PostgreSQL. All food logs, custom foods, and nutrition targets are scoped to their owner.

## Checks

Run the backend calculation/API tests, frontend production build, and Prisma schema validation:

```powershell
npm test
npm run build
npm run db:validate -w backend
```

The automated tests cover nutrition estimates, serving quantity/macronutrient calculations, dietary suggestions, validation, authentication, and the earlier workout analytics. They do not prove PostgreSQL persistence. Full persistence testing requires PostgreSQL: apply migrations, seed exercises and foods, register/sign in, log and edit food entries, review history, and verify records after restarting the app. In `MEMORY_MODE=true`, data is temporary and resets when the backend restarts.

For Prisma's interactive data browser:

```powershell
npm run db:studio
```

## GitHub Push 4

After running the checks and reviewing the changes, push Phase 4 from the project root:

```powershell
git add README.md backend frontend package-lock.json
git commit -m "feat: add nutrition tracking and fitness goal modes"
git push origin main
```
