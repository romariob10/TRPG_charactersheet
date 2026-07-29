import { createDatabase } from "../packages/database/dist/index.js";
import { AuthService } from "../apps/api/dist/modules/auth/service.js";

const databaseUrl = requiredEnv("DATABASE_URL");
const email = requiredEnv("ADMIN_EMAIL").trim().toLowerCase();
const password = requiredEnv("ADMIN_PASSWORD");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_EMAIL must be a valid email address");
}
if (password.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
}

const database = createDatabase(databaseUrl);
try {
  const admin = await new AuthService(database).createAdmin(email, password);
  console.log(`Administrator created: ${admin.email}`);
} finally {
  await database.destroy();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
