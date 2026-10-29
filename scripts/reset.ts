import { createDatabase } from '../server/db';
import { seedDemo } from '../server/seed';
if (process.argv[2] !== '--confirm-demo-reset')
  throw new Error('This only resets the synthetic demo. Pass --confirm-demo-reset to proceed.');
const db = await createDatabase();
try {
  await seedDemo(db, true);
  console.log('Only the demonstration organisation was reset.');
} finally {
  await db.close();
}
