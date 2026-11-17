import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();

(support.supported ? describe : describe.skip)("postgres ReadyForQuery row index reset", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("postgres-row-index-reset-");
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  afterAll(async () => {
    await database?.cleanup();
  });

  it("starts the next result at row 0 after a mid-stream error on the same connection", async () => {
    // One connection only, so the second query provably reuses the connection
    // that saw the error. Without `max: 1` the pool hides the defect by
    // handing out a pristine connection.
    const sql = postgres(database.connectionString, { max: 1 });

    try {
      // Rows 1 and 2 arrive, then row 3 raises `division by zero`, so the
      // backend answers ErrorResponse + ReadyForQuery without a
      // CommandComplete - the one path that leaves the row cursor dirty.
      const failure = await sql`select 1 / (3 - g) as v from generate_series(1, 5) g`.then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain("division by zero");

      const rows = await sql`select 1 as a`;

      expect(rows.length).toBe(1);
      expect(rows[0]).toBeDefined();
      expect(rows[0]).toEqual({ a: 1 });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
});
