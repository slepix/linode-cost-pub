const apiUrl = import.meta.env.VITE_API_URL as string;

if (!apiUrl) {
  throw new Error('Missing VITE_API_URL environment variable');
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('lccm_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token ?? null;
  } catch {
    return null;
  }
}

type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in' | 'cs' | 'cd';

interface QueryBuilder {
  _table: string;
  _select: string;
  _filters: string[];
  _order: string | null;
  _limit: number | null;
  _single: boolean;
  _maybeSingle: boolean;
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  gt(column: string, value: unknown): QueryBuilder;
  gte(column: string, value: unknown): QueryBuilder;
  lt(column: string, value: unknown): QueryBuilder;
  lte(column: string, value: unknown): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  or(filter: string): QueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): QueryBuilder;
  limit(n: number): QueryBuilder;
  single(): Promise<{ data: unknown; error: ApiError | null }>;
  maybeSingle(): Promise<{ data: unknown; error: ApiError | null }>;
  then(resolve: (val: { data: unknown; error: ApiError | null }) => void, reject?: (err: unknown) => void): void;
}

interface ApiError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

function buildHeaders(asAuthenticated = true): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const token = getToken();
  if (token && asAuthenticated) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function encodeFilter(column: string, op: FilterOperator, value: unknown): string {
  if (op === 'is') {
    return `${column}=is.${value}`;
  }
  if (op === 'in' && Array.isArray(value)) {
    return `${column}=in.(${value.join(',')})`;
  }
  return `${column}=${op}.${encodeURIComponent(String(value))}`;
}

async function executeQuery(builder: QueryBuilder): Promise<{ data: unknown; error: ApiError | null }> {
  const params = new URLSearchParams();

  if (builder._select) {
    params.set('select', builder._select);
  }

  for (const f of builder._filters) {
    const [key, val] = f.split('=', 2) as [string, string];
    params.append(key, val);
  }

  if (builder._order) {
    params.set('order', builder._order);
  }

  if (builder._limit !== null) {
    params.set('limit', String(builder._limit));
  }

  const url = `${apiUrl}/${builder._table}?${params.toString()}`;
  const headers = buildHeaders();

  if (builder._single || builder._maybeSingle) {
    headers['Accept'] = 'application/vnd.pgrst.object+json';
  }

  try {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 406 && builder._maybeSingle) {
        return { data: null, error: null };
      }
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      return { data: null, error: { message: body?.message ?? `HTTP ${res.status}`, code: body?.code, details: body?.details, hint: body?.hint } };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

function createQueryBuilder(table: string): QueryBuilder {
  const builder: QueryBuilder = {
    _table: table,
    _select: '*',
    _filters: [],
    _order: null,
    _limit: null,
    _single: false,
    _maybeSingle: false,

    select(columns = '*') {
      this._select = columns;
      return this;
    },

    eq(column, value) {
      if (value === null || value === undefined) {
        this._filters.push(`${column}=is.null`);
      } else {
        this._filters.push(encodeFilter(column, 'eq', value));
      }
      return this;
    },

    neq(column, value) {
      this._filters.push(encodeFilter(column, 'neq', value));
      return this;
    },

    gt(column, value) {
      this._filters.push(encodeFilter(column, 'gt', value));
      return this;
    },

    gte(column, value) {
      this._filters.push(encodeFilter(column, 'gte', value));
      return this;
    },

    lt(column, value) {
      this._filters.push(encodeFilter(column, 'lt', value));
      return this;
    },

    lte(column, value) {
      this._filters.push(encodeFilter(column, 'lte', value));
      return this;
    },

    is(column, value) {
      this._filters.push(`${column}=is.${value}`);
      return this;
    },

    or(filter) {
      this._filters.push(`or=(${filter})`);
      return this;
    },

    order(column, opts = {}) {
      const dir = opts.ascending === false ? 'desc' : 'asc';
      this._order = `${column}.${dir}`;
      return this;
    },

    limit(n) {
      this._limit = n;
      return this;
    },

    async single() {
      this._single = true;
      return executeQuery(this);
    },

    async maybeSingle() {
      this._maybeSingle = true;
      return executeQuery(this);
    },

    then(resolve, reject) {
      executeQuery(this).then(resolve, reject);
    },
  };
  return builder;
}

async function insertRows(table: string, rows: unknown, opts?: { returning?: boolean }): Promise<{ data: unknown; error: ApiError | null }> {
  const headers = buildHeaders();
  if (opts?.returning !== false) {
    headers['Prefer'] = 'return=representation';
  }

  try {
    const res = await fetch(`${apiUrl}/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      return { data: null, error: { message: body?.message ?? `HTTP ${res.status}`, code: body?.code } };
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

interface UpdateBuilder {
  _table: string;
  _filters: string[];
  _data: unknown;
  eq(column: string, value: unknown): UpdateBuilder;
  then(resolve: (val: { data: unknown; error: ApiError | null }) => void, reject?: (err: unknown) => void): void;
}

function createUpdateBuilder(table: string, data: unknown): UpdateBuilder {
  const builder: UpdateBuilder = {
    _table: table,
    _filters: [],
    _data: data,

    eq(column, value) {
      if (value === null || value === undefined) {
        this._filters.push(`${column}=is.null`);
      } else {
        this._filters.push(encodeFilter(column, 'eq', value));
      }
      return this;
    },

    then(resolve, reject) {
      const params = new URLSearchParams();
      for (const f of this._filters) {
        const [key, val] = f.split('=', 2) as [string, string];
        params.append(key, val);
      }

      const headers = buildHeaders();
      headers['Prefer'] = 'return=representation';

      fetch(`${apiUrl}/${this._table}?${params.toString()}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(this._data),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as Record<string, string>;
            return { data: null, error: { message: body?.message ?? `HTTP ${res.status}` } };
          }
          const text = await res.text();
          const data = text ? JSON.parse(text) : null;
          return { data, error: null };
        })
        .then(resolve, reject);
    },
  };
  return builder;
}

interface DeleteBuilder {
  _table: string;
  _filters: string[];
  eq(column: string, value: unknown): DeleteBuilder;
  neq(column: string, value: unknown): DeleteBuilder;
  then(resolve: (val: { data: unknown; error: ApiError | null }) => void, reject?: (err: unknown) => void): void;
}

function createDeleteBuilder(table: string): DeleteBuilder {
  const builder: DeleteBuilder = {
    _table: table,
    _filters: [],

    eq(column, value) {
      if (value === null || value === undefined) {
        this._filters.push(`${column}=is.null`);
      } else {
        this._filters.push(encodeFilter(column, 'eq', value));
      }
      return this;
    },

    neq(column, value) {
      this._filters.push(encodeFilter(column, 'neq', value));
      return this;
    },

    then(resolve, reject) {
      const params = new URLSearchParams();
      for (const f of this._filters) {
        const [key, val] = f.split('=', 2) as [string, string];
        params.append(key, val);
      }

      const headers = buildHeaders();

      fetch(`${apiUrl}/${this._table}?${params.toString()}`, {
        method: 'DELETE',
        headers,
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as Record<string, string>;
            return { data: null, error: { message: body?.message ?? `HTTP ${res.status}` } };
          }
          return { data: null, error: null };
        })
        .then(resolve, reject);
    },
  };
  return builder;
}

async function callRpc(fnName: string, params: Record<string, unknown> = {}): Promise<{ data: unknown; error: ApiError | null }> {
  const headers = buildHeaders();

  try {
    const res = await fetch(`${apiUrl}/rpc/${fnName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      return { data: null, error: { message: body?.message ?? body?.hint ?? `HTTP ${res.status}`, code: body?.code } };
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

async function callRpcAnon(fnName: string, params: Record<string, unknown> = {}): Promise<{ data: unknown; error: ApiError | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  try {
    const res = await fetch(`${apiUrl}/rpc/${fnName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      return { data: null, error: { message: body?.message ?? body?.hint ?? `HTTP ${res.status}`, code: body?.code } };
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

export interface PostgRESTClient {
  from(table: string): {
    select(columns?: string): QueryBuilder;
    insert(rows: unknown): Promise<{ data: unknown; error: ApiError | null }>;
    update(data: unknown): UpdateBuilder;
    delete(): DeleteBuilder;
    upsert(rows: unknown): Promise<{ data: unknown; error: ApiError | null }>;
  };
  rpc(fnName: string, params?: Record<string, unknown>): Promise<{ data: unknown; error: ApiError | null }>;
}

export const supabase: PostgRESTClient = {
  from(table: string) {
    return {
      select(columns = '*') {
        return createQueryBuilder(table).select(columns);
      },
      insert(rows: unknown) {
        return insertRows(table, rows);
      },
      update(data: unknown) {
        return createUpdateBuilder(table, data);
      },
      delete() {
        return createDeleteBuilder(table);
      },
      upsert(rows: unknown) {
        const headers = buildHeaders();
        headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
        return fetch(`${apiUrl}/${table}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(rows),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as Record<string, string>;
            return { data: null, error: { message: body?.message ?? `HTTP ${res.status}` } };
          }
          const text = await res.text();
          return { data: text ? JSON.parse(text) : null, error: null };
        });
      },
    };
  },

  rpc(fnName: string, params: Record<string, unknown> = {}) {
    return callRpc(fnName, params);
  },
};

export function getAuthedClient(): PostgRESTClient {
  return supabase;
}

export function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem('lccm_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user_id ?? null;
  } catch {
    return null;
  }
}

export { callRpcAnon };
