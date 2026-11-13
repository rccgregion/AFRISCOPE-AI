import { createDatabase } from '../server/db';
import { seedDemo, bootstrapAdmin, ensureUser } from '../server/seed';
const db = await createDatabase();
try {
  if (process.env.ADMIN_PASSWORD && (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME))
    await bootstrapAdmin(
      db,
      { email: process.env.ADMIN_EMAIL, username: process.env.ADMIN_USERNAME },
      process.env.ADMIN_PASSWORD,
    );
  else await seedDemo(db);
  if (process.env.ADMIN_PASSWORD) {
    await ensureUser(db, process.env.ADMIN_USERNAME || 'declareola', process.env.ADMIN_PASSWORD);
  }
  console.log('Seed complete. User declareola is configured and demonstration records are ready.');
} finally {
  await db.close();
}
