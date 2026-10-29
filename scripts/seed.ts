import { createDatabase } from '../server/db';
import { seedDemo, bootstrapAdmin } from '../server/seed';
const db = await createDatabase();
try {
  if (process.env.ADMIN_PASSWORD && (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME))
    await bootstrapAdmin(
      db,
      { email: process.env.ADMIN_EMAIL, username: process.env.ADMIN_USERNAME },
      process.env.ADMIN_PASSWORD,
    );
  else await seedDemo(db);
  console.log(
    process.env.ADMIN_PASSWORD
      ? 'Administrator bootstrap complete.'
      : 'Seed complete. Synthetic demonstration records are ready.',
  );
} finally {
  await db.close();
}
