import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
export type Database = typeof db;

/** Type that works for both the main db instance and a transaction. */
export type DatabaseOrTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
