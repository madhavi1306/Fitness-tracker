import 'dotenv/config';
import { app } from './app.js';
import { prisma } from './utils/prisma.js';

const port = Number(process.env.PORT) || 4000;

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('DATABASE_URL and a JWT_SECRET of at least 32 characters are required.');
  process.exit(1);
}

const server = app.listen(port, () => {
  console.log(`Fitness Tracker API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
