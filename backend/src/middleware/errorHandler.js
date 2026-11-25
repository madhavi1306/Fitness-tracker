export function notFound(req, res) {
  return res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);

  const databaseUnavailable = error?.name === 'PrismaClientInitializationError'
    || ['P1000', 'P1001', 'P1002', 'P1003'].includes(error?.code);
  if (databaseUnavailable) {
    return res.status(503).json({
      error: 'The database is unavailable. Start PostgreSQL, set DATABASE_URL in backend/.env, then run npm run db:migrate.',
    });
  }

  if (['P2021', 'P2022'].includes(error?.code)) {
    return res.status(503).json({
      error: 'The database schema is not ready. Run npm run db:migrate from the project root, then restart the backend.',
    });
  }

  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
