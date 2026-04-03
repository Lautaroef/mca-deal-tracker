import dotenv from "dotenv";
import path from "path";

// Load environment variables from the project root .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Use the session pooler (port 5432) for tests to avoid stale-read issues
// with Supabase's transaction pooler (pgbouncer in transaction mode).
if (process.env.DATABASE_URL_MIGRATION) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_MIGRATION;
}
