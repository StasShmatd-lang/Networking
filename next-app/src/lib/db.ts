import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
let pool: pg.Pool | undefined;

type GlobalDb = { __networkingPglite?: Promise<PGlite> };
const g = globalThis as typeof globalThis & GlobalDb;

export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

function getPool() {
  pool ??= new pg.Pool({ connectionString: databaseUrl, max: 8 });
  return pool;
}

function getLocal() {
  // Survive Next.js route recompiles — module-scoped `let` resets per chunk.
  g.__networkingPglite ??= startLocal().catch((error: unknown) => {
    g.__networkingPglite = undefined;
    throw error;
  });
  return g.__networkingPglite;
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    return (await getPool().query(text, params)).rows as T[];
  }
  return (await (await getLocal()).query<T>(text, params)).rows;
}

/**
 * Run several statements in one transaction.
 * Used with `select ... for update` so simultaneous joins / clicks
 * wait for each other instead of overwriting the whole event.
 */
export async function withTx<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  if (databaseUrl !== "") {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const q: Query = async (text, params = []) => (await client.query(text, params)).rows;
      const result = await fn(q);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        /* connection already broken */
      }
      throw error;
    } finally {
      client.release();
    }
  }
  const db = await getLocal();
  return db.transaction(async (tx) => {
    const q: Query = async (text, params = []) => (await tx.query(text, params)).rows as never;
    return fn(q);
  });
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir("migrations").catch(() => [])).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
