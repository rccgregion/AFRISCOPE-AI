import { createDatabase } from '../server/db';
import { seedDemo, bootstrapAdmin } from '../server/seed';
const db = await createDatabase();
try {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)
    await bootstrapAdmin(db, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  else await seedDemo(db);
  console.log('Seed complete. Synthetic demonstration records are ready.');
} finally {
  await db.close();
}
