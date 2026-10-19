import {
  createClient,
  type Client,
  type InValue,
  type ResultSet,
} from "@libsql/client";

/** Only the query operations used by attendance are exposed here. */
class Statement {
  readonly client: Client;
  readonly sql: string;
  readonly args: InValue[];
  constructor(client: Client, sql: string, args: InValue[] = []) {
    this.client = client;
    this.sql = sql;
    this.args = args;
  }

  bind(...args: InValue[]) {
    return new Statement(this.client, this.sql, args);
  }

  async all() {
    const result = await this.run();
    return { results: result.rows };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.run();
    return (result.rows[0] as T | undefined) ?? null;
  }

  run(): Promise<ResultSet> {
    return this.client.execute({ sql: this.sql, args: this.args });
  }
}

let client: Client | undefined;
export function database() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("Database is not configured");
    if (
      process.env.NODE_ENV === "production" &&
      !/^(libsql|https):\/\//.test(url)
    ) {
      throw new Error("Production requires a hosted libSQL database");
    }
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (/^(libsql|https):\/\//.test(url) && !authToken) {
      throw new Error("Hosted database credentials are not configured");
    }
    client = createClient({ url, authToken });
  }
  const connection = client;
  return {
    prepare: (sql: string) => new Statement(connection, sql),
    batch: (statements: Statement[]) =>
      connection.batch(
        statements.map(({ sql, args }) => ({ sql, args })),
        "write",
      ),
  };
}
