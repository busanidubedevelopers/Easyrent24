import { pool, query } from './db';
import { extractToken, verifyToken } from './auth';
import fs from 'fs/promises';
import nodePath from 'path';

// Where uploaded files actually live on disk. Defaults to ./uploads under
// the process's cwd, which in the Docker runtime image is /app (see
// Dockerfile WORKDIR) — matching the /app/uploads volume mount in
// docker-compose.yml so files survive container restarts.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || nodePath.join(process.cwd(), 'uploads');

export interface PostgrestResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export class StorageBucket {
  private bucketName: string;

  constructor(bucketName: string) {
    this.bucketName = bucketName;
  }

  /**
   * Writes the file to local disk under UPLOAD_ROOT/<bucket>/<path>. This
   * replaces real cloud storage (S3/Supabase Storage) for local dev and
   * this phase's Docker demo — same scope as the rest of this client, which
   * swaps Supabase for plain Postgres. `fileBody` is whatever the caller's
   * File.arrayBuffer() produced (ArrayBuffer), a Node Buffer, or a string.
   */
  async upload(
    path: string,
    fileBody: ArrayBuffer | Uint8Array | Buffer | string,
    _options?: any
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
    try {
      const destination = nodePath.join(UPLOAD_ROOT, this.bucketName, path);
      await fs.mkdir(nodePath.dirname(destination), { recursive: true });

      const buffer =
        typeof fileBody === 'string'
          ? Buffer.from(fileBody)
          : Buffer.isBuffer(fileBody)
            ? fileBody
            : fileBody instanceof Uint8Array
              ? Buffer.from(fileBody.buffer, fileBody.byteOffset, fileBody.byteLength)
              : Buffer.from(fileBody as ArrayBuffer);

      await fs.writeFile(destination, buffer);
      return { data: { path: `${this.bucketName}/${path}` }, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Upload failed.' } };
    }
  }

  /**
   * Reads a previously uploaded file back off disk. Used by routes that
   * stream a private document back to an authorized caller (documents
   * aren't served via a public URL — see the /documents API route).
   */
  async download(path: string): Promise<{ data: Buffer | null; error: { message: string } | null }> {
    try {
      const source = nodePath.join(UPLOAD_ROOT, this.bucketName, path);
      const data = await fs.readFile(source);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'File not found.' } };
    }
  }

  /** Deletes files; missing files are ignored (same as Supabase Storage). */
  async remove(paths: string[]): Promise<{ data: null; error: { message: string } | null }> {
    try {
      await Promise.all(paths.map((path) => fs.rm(nodePath.join(UPLOAD_ROOT, this.bucketName, path), { force: true })));
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Delete failed.' } };
    }
  }

  getPublicUrl(path: string) {
    return {
      data: {
        publicUrl: `https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80#${encodeURIComponent(path)}`,
      },
    };
  }
}

export class PostgresQueryBuilder implements PromiseLike<PostgrestResponse> {
  private tableName: string;
  private selectFields: string = '*';
  private whereClauses: string[] = [];
  private params: any[] = [];
  private orderByClause: string = '';
  private limitValue?: number;
  private offsetValue?: number;
  private isSingle = false;
  private isMaybeSingle = false;
  private isCountExact = false;

  private opType: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private insertData: any = null;
  private updateData: any = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields?: string, options?: { count?: 'exact' | 'planned' | 'estimated' }): this {
    if (fields) {
      this.selectFields = fields.trim() === '*' ? '*' : fields;
    }
    if (options?.count === 'exact') {
      this.isCountExact = true;
    }
    return this;
  }

  insert(values: any | any[]): this {
    this.opType = 'insert';
    this.insertData = values;
    return this;
  }

  upsert(values: any | any[]): this {
    this.opType = 'insert';
    this.insertData = values;
    return this;
  }

  update(values: any): this {
    this.opType = 'update';
    this.updateData = values;
    return this;
  }

  delete(): this {
    this.opType = 'delete';
    return this;
  }

  eq(column: string, value: any): this {
    if (value === null || value === undefined) {
      this.whereClauses.push(`"${column}" IS NULL`);
    } else {
      this.params.push(value);
      this.whereClauses.push(`"${column}" = $${this.params.length}`);
    }
    return this;
  }

  neq(column: string, value: any): this {
    if (value === null || value === undefined) {
      this.whereClauses.push(`"${column}" IS NOT NULL`);
    } else {
      this.params.push(value);
      this.whereClauses.push(`"${column}" != $${this.params.length}`);
    }
    return this;
  }

  gt(column: string, value: any): this {
    this.params.push(value);
    this.whereClauses.push(`"${column}" > $${this.params.length}`);
    return this;
  }

  gte(column: string, value: any): this {
    this.params.push(value);
    this.whereClauses.push(`"${column}" >= $${this.params.length}`);
    return this;
  }

  lt(column: string, value: any): this {
    this.params.push(value);
    this.whereClauses.push(`"${column}" < $${this.params.length}`);
    return this;
  }

  lte(column: string, value: any): this {
    this.params.push(value);
    this.whereClauses.push(`"${column}" <= $${this.params.length}`);
    return this;
  }

  in(column: string, values: any[]): this {
    if (!values || values.length === 0) {
      this.whereClauses.push('FALSE');
      return this;
    }
    this.params.push(values);
    this.whereClauses.push(`"${column}" = ANY($${this.params.length})`);
    return this;
  }

  is(column: string, value: any): this {
    if (value === null) {
      this.whereClauses.push(`"${column}" IS NULL`);
    } else if (value === true) {
      this.whereClauses.push(`"${column}" IS TRUE`);
    } else if (value === false) {
      this.whereClauses.push(`"${column}" IS FALSE`);
    } else {
      this.params.push(value);
      this.whereClauses.push(`"${column}" IS NOT DISTINCT FROM $${this.params.length}`);
    }
    return this;
  }

  like(column: string, pattern: string): this {
    this.params.push(pattern);
    this.whereClauses.push(`"${column}" LIKE $${this.params.length}`);
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.params.push(pattern);
    this.whereClauses.push(`"${column}" ILIKE $${this.params.length}`);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const dir = options?.ascending === false ? 'DESC' : 'ASC';
    this.orderByClause = `ORDER BY "${column}" ${dir}`;
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = Math.max(0, from);
    this.limitValue = Math.max(1, to - from + 1);
    return this;
  }

  single(): this {
    this.isSingle = true;
    this.limitValue = 1;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    this.limitValue = 1;
    return this;
  }

  private buildWhereSql(): string {
    if (this.whereClauses.length === 0) return '';
    return 'WHERE ' + this.whereClauses.join(' AND ');
  }

  async execute(): Promise<PostgrestResponse> {
    try {
      const table = `public."${this.tableName.replace(/[^a-zA-Z0-9_]/g, '')}"`;

      if (this.opType === 'insert') {
        const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
        if (rows.length === 0) return { data: [], error: null };

        const cols = Object.keys(rows[0]);
        const colNames = cols.map((c) => `"${c}"`).join(', ');

        const valueTuples: string[] = [];
        const params: any[] = [];

        for (const row of rows) {
          const placeholders = cols.map((col) => {
            params.push(row[col] === undefined ? null : row[col]);
            return `$${params.length}`;
          });
          valueTuples.push(`(${placeholders.join(', ')})`);
        }

        const sql = `INSERT INTO ${table} (${colNames}) VALUES ${valueTuples.join(', ')} RETURNING *;`;
        const res = await query(sql, params);

        const data = Array.isArray(this.insertData) ? res.rows : res.rows[0] ?? null;
        return { data: this.isSingle ? res.rows[0] ?? null : data, error: null };
      }

      if (this.opType === 'update') {
        const keys = Object.keys(this.updateData);
        if (keys.length === 0) return { data: null, error: null };

        const setFragments: string[] = [];
        const updateParams: any[] = [];

        for (const key of keys) {
          updateParams.push(this.updateData[key]);
          setFragments.push(`"${key}" = $${updateParams.length}`);
        }

        const offset = updateParams.length;
        const reindexedWhere = this.whereClauses.map((clause) =>
          clause.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + offset}`)
        );
        const whereSql = reindexedWhere.length > 0 ? 'WHERE ' + reindexedWhere.join(' AND ') : '';

        const allParams = [...updateParams, ...this.params];
        const sql = `UPDATE ${table} SET ${setFragments.join(', ')} ${whereSql} RETURNING *;`;

        const res = await query(sql, allParams);
        if (this.isSingle || this.isMaybeSingle) {
          return { data: res.rows[0] ?? null, error: null };
        }
        return { data: res.rows, error: null };
      }

      if (this.opType === 'delete') {
        const whereSql = this.buildWhereSql();
        const sql = `DELETE FROM ${table} ${whereSql} RETURNING *;`;
        const res = await query(sql, this.params);
        return { data: res.rows, error: null };
      }

      // SELECT
      let exactCount: number | null = null;
      if (this.isCountExact) {
        const countSql = `SELECT COUNT(*)::int as cnt FROM ${table} ${this.buildWhereSql()};`;
        const countRes = await query(countSql, this.params);
        exactCount = countRes.rows[0]?.cnt ?? 0;
      }

      let sql = `SELECT ${this.selectFields === '*' ? '*' : this.selectFields} FROM ${table} ${this.buildWhereSql()}`;
      if (this.orderByClause) {
        sql += ` ${this.orderByClause}`;
      }
      if (this.limitValue !== undefined) {
        sql += ` LIMIT ${this.limitValue}`;
      }
      if (this.offsetValue !== undefined) {
        sql += ` OFFSET ${this.offsetValue}`;
      }

      const res = await query(sql, this.params);

      if (this.isSingle) {
        if (res.rows.length === 0) {
          return {
            data: null,
            error: { message: 'Row not found', code: 'PGRST116' },
            count: exactCount,
          };
        }
        return { data: res.rows[0], error: null, count: exactCount };
      }

      if (this.isMaybeSingle) {
        return { data: res.rows[0] ?? null, error: null, count: exactCount };
      }

      return { data: res.rows, error: null, count: exactCount ?? res.rows.length };
    } catch (err: any) {
      console.error(`PostgresQueryBuilder error on ${this.tableName}:`, err);
      return { data: null, error: { message: err.message || 'Database error', code: err.code } };
    }
  }

  then<TResult1 = PostgrestResponse, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export class PostgresClient {
  private token?: string | null;

  storage = {
    from: (bucketName: string) => new StorageBucket(bucketName),
  };

  auth: {
    getUser: (providedToken?: string) => Promise<{ data: { user: any | null }; error: Error | null }>;
    admin: {
      createUser: (params: { email: string; password?: string; user_metadata?: any }) => Promise<{ data: { user: any }; error: null }>;
      deleteUser: (id: string) => Promise<{ data: null; error: null }>;
    };
  };

  constructor(token?: string | null) {
    this.token = token;
    const client = this;

    this.auth = {
      getUser: async (providedToken?: string) => {
        const tok = providedToken ?? client.token;
        if (!tok) return { data: { user: null }, error: new Error('No session') };

        try {
          const decoded = await verifyToken(tok);
          const res = await query(
            'SELECT id, email, full_name, role, phone, is_verified FROM public.users WHERE id = $1',
            [decoded.id]
          );
          if (res.rows.length === 0) {
            return { data: { user: null }, error: new Error('User not found') };
          }
          const user = res.rows[0];
          return {
            data: {
              user: {
                id: user.id,
                email: user.email,
                user_metadata: {
                  full_name: user.full_name,
                  role: user.role,
                },
                role: user.role,
              },
            },
            error: null,
          };
        } catch (err: any) {
          return { data: { user: null }, error: err };
        }
      },
      admin: {
        createUser: async (params: { email: string; password?: string; user_metadata?: any }) => {
          const email = params.email;
          const fullName = params.user_metadata?.full_name || '';
          const role = params.user_metadata?.role || 'tenant';
          const res = await query(
            `INSERT INTO public.users (email, password_hash, full_name, role)
             VALUES ($1, 'dummy_hash', $2, $3) RETURNING *`,
            [email, fullName, role]
          );
          return { data: { user: res.rows[0] }, error: null };
        },
        deleteUser: async (id: string) => {
          await query('DELETE FROM public.users WHERE id = $1', [id]);
          return { data: null, error: null };
        },
      },
    };
  }

  from(tableName: string) {
    return new PostgresQueryBuilder(tableName);
  }
}
