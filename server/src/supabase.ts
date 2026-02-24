import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL environment variable is required');

const pool = new Pool({ connectionString });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface QueryResult<T = any> {
  data: T | null;
  error: { message: string } | null;
}

type FilterEntry = { column: string; op: string; value: unknown };

function parseOrFilter(filter: string, startIdx: number): { sql: string; params: unknown[]; nextIdx: number } {
  const parts = filter.split(',');
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;
  for (const part of parts) {
    const dotParts = part.split('.');
    if (dotParts.length < 2) continue;
    const col = dotParts[0];
    const op = dotParts[1];
    const val = dotParts.slice(2).join('.');
    if (op === 'is' && (val === 'null' || val === 'NULL')) {
      clauses.push(`${quoteIdent(col)} IS NULL`);
    } else if (op === 'eq') {
      clauses.push(`${quoteIdent(col)} = $${idx++}`);
      params.push(val);
    } else if (op === 'neq') {
      clauses.push(`${quoteIdent(col)} != $${idx++}`);
      params.push(val);
    } else {
      clauses.push(`${quoteIdent(col)} ${op} $${idx++}`);
      params.push(val);
    }
  }
  return { sql: '(' + clauses.join(' OR ') + ')', params, nextIdx: idx };
}

function buildWhere(filters: FilterEntry[], startIdx = 1): { sql: string; params: unknown[] } {
  if (filters.length === 0) return { sql: '', params: [] };
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  for (const f of filters) {
    if (f.op === 'eq') {
      if (f.value === null) {
        clauses.push(`${quoteIdent(f.column)} IS NULL`);
      } else {
        clauses.push(`${quoteIdent(f.column)} = $${idx++}`);
        params.push(f.value);
      }
    } else if (f.op === 'neq') {
      clauses.push(`${quoteIdent(f.column)} != $${idx++}`);
      params.push(f.value);
    } else if (f.op === 'is') {
      clauses.push(`${quoteIdent(f.column)} IS ${f.value}`);
    } else if (f.op === 'or') {
      const parsed = parseOrFilter(f.value as string, idx);
      clauses.push(parsed.sql);
      params.push(...parsed.params);
      idx = parsed.nextIdx;
    } else {
      clauses.push(`${quoteIdent(f.column)} ${f.op} $${idx++}`);
      params.push(f.value);
    }
  }

  return { sql: ' WHERE ' + clauses.join(' AND '), params };
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

function buildSelectCols(select?: string): string {
  if (!select || select === '*') return '*';
  return select.split(',').map(s => s.trim()).map(col => {
    if (col.includes('(') || col === '*' || col.includes(' ') || col.includes(':')) return col;
    return quoteIdent(col);
  }).join(', ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class SelectBuilder<T = any> {
  private _table: string;
  private _select: string;
  private _filters: FilterEntry[] = [];
  private _order: string | null = null;
  private _limit: number | null = null;

  constructor(table: string, select = '*') {
    this._table = table;
    this._select = select;
  }

  select(cols: string) {
    this._select = cols;
    return this;
  }

  eq(column: string, value: unknown) {
    this._filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown) {
    this._filters.push({ column, op: 'neq', value });
    return this;
  }

  is(column: string, value: unknown) {
    this._filters.push({ column, op: 'is', value });
    return this;
  }

  or(filter: string) {
    this._filters.push({ column: '', op: 'or', value: filter });
    return this;
  }

  order(column: string, opts: { ascending?: boolean } = {}) {
    const dir = opts.ascending === false ? 'DESC' : 'ASC';
    this._order = `${quoteIdent(column)} ${dir}`;
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  async single(): Promise<QueryResult<T>> {
    return this._exec(true, false);
  }

  async maybeSingle(): Promise<QueryResult<T | null>> {
    return this._exec(false, true) as Promise<QueryResult<T | null>>;
  }

  then<TResult1 = QueryResult<T[]>>(
    resolve: (value: QueryResult<T[]>) => TResult1 | PromiseLike<TResult1>,
    reject?: (reason: unknown) => TResult1 | PromiseLike<TResult1>
  ) {
    return this._execMany().then(resolve, reject);
  }

  private async _execMany(): Promise<QueryResult<T[]>> {
    try {
      const { sql: where, params } = buildWhere(this._filters);
      let sql = `SELECT ${buildSelectCols(this._select)} FROM ${quoteIdent(this._table)}${where}`;
      if (this._order) sql += ` ORDER BY ${this._order}`;
      if (this._limit !== null) sql += ` LIMIT ${this._limit}`;
      const { rows } = await pool.query(sql, params);
      return { data: rows as T[], error: null };
    } catch (err: unknown) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async _exec(_single: boolean, _maybe: boolean): Promise<QueryResult<T>> {
    try {
      const { sql: where, params } = buildWhere(this._filters);
      let sql = `SELECT ${buildSelectCols(this._select)} FROM ${quoteIdent(this._table)}${where}`;
      if (this._order) sql += ` ORDER BY ${this._order}`;
      sql += ' LIMIT 1';
      const { rows } = await pool.query(sql, params);
      if (rows.length === 0) {
        if (_single) return { data: null, error: { message: 'No rows found' } };
        return { data: null, error: null };
      }
      return { data: rows[0] as T, error: null };
    } catch (err: unknown) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

class UpdateBuilder {
  private _table: string;
  private _data: Record<string, unknown>;
  private _filters: FilterEntry[] = [];

  constructor(table: string, data: Record<string, unknown>) {
    this._table = table;
    this._data = data;
  }

  eq(column: string, value: unknown) {
    this._filters.push({ column, op: 'eq', value });
    return this;
  }

  then<TResult1 = QueryResult<unknown>>(
    resolve: (value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>,
    reject?: (reason: unknown) => TResult1 | PromiseLike<TResult1>
  ) {
    return this._exec().then(resolve, reject);
  }

  private async _exec(): Promise<QueryResult<unknown>> {
    try {
      const cols = Object.keys(this._data);
      if (cols.length === 0) return { data: null, error: null };

      const setClauses = cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`);
      const setParams = cols.map(c => this._data[c]);
      const { sql: where, params: whereParams } = buildWhere(this._filters, cols.length + 1);

      const sql = `UPDATE ${quoteIdent(this._table)} SET ${setClauses.join(', ')}${where}`;
      await pool.query(sql, [...setParams, ...whereParams]);
      return { data: null, error: null };
    } catch (err: unknown) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

class DeleteBuilder {
  private _table: string;
  private _filters: FilterEntry[] = [];

  constructor(table: string) {
    this._table = table;
  }

  eq(column: string, value: unknown) {
    this._filters.push({ column, op: 'eq', value });
    return this;
  }

  then<TResult1 = QueryResult<unknown>>(
    resolve: (value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>,
    reject?: (reason: unknown) => TResult1 | PromiseLike<TResult1>
  ) {
    return this._exec().then(resolve, reject);
  }

  private async _exec(): Promise<QueryResult<unknown>> {
    try {
      const { sql: where, params } = buildWhere(this._filters);
      await pool.query(`DELETE FROM ${quoteIdent(this._table)}${where}`, params);
      return { data: null, error: null };
    } catch (err: unknown) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

async function insertRows(table: string, rows: unknown): Promise<QueryResult<unknown>> {
  try {
    const arr = Array.isArray(rows) ? rows : [rows];
    if (arr.length === 0) return { data: [], error: null };

    const BATCH_SIZE = 500;
    for (let i = 0; i < arr.length; i += BATCH_SIZE) {
      const batch = arr.slice(i, i + BATCH_SIZE);
      const cols = Object.keys(batch[0] as Record<string, unknown>);
      const placeholders = batch.map((_, rowIdx) =>
        '(' + cols.map((_, colIdx) => `$${rowIdx * cols.length + colIdx + 1}`).join(', ') + ')'
      ).join(', ');
      const colNames = cols.map(quoteIdent).join(', ');
      const params = batch.flatMap(row => cols.map(c => (row as Record<string, unknown>)[c]));
      await pool.query(
        `INSERT INTO ${quoteIdent(table)} (${colNames}) VALUES ${placeholders}`,
        params
      );
    }
    return { data: arr, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

async function upsertRows(
  table: string,
  rows: unknown,
  opts?: { onConflict?: string; ignoreDuplicates?: boolean }
): Promise<QueryResult<unknown>> {
  try {
    const arr = Array.isArray(rows) ? rows : [rows];
    if (arr.length === 0) return { data: [], error: null };

    const cols = Object.keys(arr[0] as Record<string, unknown>);
    const placeholders = arr.map((_, rowIdx) =>
      '(' + cols.map((_, colIdx) => `$${rowIdx * cols.length + colIdx + 1}`).join(', ') + ')'
    ).join(', ');
    const colNames = cols.map(quoteIdent).join(', ');
    const params = arr.flatMap(row => cols.map(c => (row as Record<string, unknown>)[c]));

    let conflict = '';
    if (opts?.onConflict) {
      const conflictCols = opts.onConflict.split(',').map(c => quoteIdent(c.trim())).join(', ');
      if (opts?.ignoreDuplicates) {
        conflict = ` ON CONFLICT (${conflictCols}) DO NOTHING`;
      } else {
        const conflictKeys = opts.onConflict.split(',').map(s => s.trim());
        const updateCols = cols.filter(c => !conflictKeys.includes(c));
        if (updateCols.length > 0) {
          conflict = ` ON CONFLICT (${conflictCols}) DO UPDATE SET ` +
            updateCols.map(c => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ');
        } else {
          conflict = ` ON CONFLICT (${conflictCols}) DO NOTHING`;
        }
      }
    }

    await pool.query(
      `INSERT INTO ${quoteIdent(table)} (${colNames}) VALUES ${placeholders}${conflict}`,
      params
    );
    return { data: arr, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

export const supabase = {
  from(table: string) {
    return {
      select(cols = '*') {
        return new SelectBuilder(table, cols);
      },
      insert(rows: unknown) {
        return insertRows(table, rows);
      },
      update(data: Record<string, unknown>) {
        return new UpdateBuilder(table, data);
      },
      delete() {
        return new DeleteBuilder(table);
      },
      upsert(rows: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        return upsertRows(table, rows, opts);
      },
    };
  },
};
