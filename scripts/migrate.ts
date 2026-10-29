import { createDatabase } from '../server/db';
const db = await createDatabase();
console.log('PostgreSQL migrations applied.');
await db.close();
