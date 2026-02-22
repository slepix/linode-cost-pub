import express from 'express';
import { fetchLinodeResources } from './linode.js';
import { runComplianceEvaluation } from './evaluate.js';
import { supabase } from './supabase.js';

const app = express();
app.use(express.json());

const API_SECRET = process.env.REFRESH_API_SECRET;

function authenticate(req: express.Request, res: express.Response): boolean {
  if (!API_SECRET) return true;
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token as string;
  if (token !== API_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/refresh', async (req, res) => {
  if (!authenticate(req, res)) return;

  const { account_id, skip_sync, skip_eval } = req.body as {
    account_id?: string;
    skip_sync?: boolean;
    skip_eval?: boolean;
  };

  try {
    let accountIds: string[] = [];

    if (account_id) {
      accountIds = [account_id];
    } else {
      const { data: accounts, error } = await supabase
        .from('linode_accounts')
        .select('id, name');
      if (error) throw error;
      accountIds = (accounts || []).map((a: any) => a.id);
    }

    if (accountIds.length === 0) {
      return res.status(404).json({ error: 'No accounts found' });
    }

    const results: any[] = [];
    const log: string[] = [];

    for (const id of accountIds) {
      const accountResult: any = { account_id: id, sync: null, eval: null };

      if (!skip_sync) {
        try {
          log.push(`[${id}] Starting resource sync...`);
          const syncResult = await fetchLinodeResources(id, (msg) => {
            log.push(`[${id}] ${msg}`);
            console.log(`[${id}] ${msg}`);
          });
          accountResult.sync = syncResult;
          log.push(`[${id}] Sync complete: ${syncResult.count} resources`);
          console.log(`[${id}] Sync complete: ${syncResult.count} resources`);
        } catch (err: any) {
          accountResult.sync = { error: err.message };
          log.push(`[${id}] Sync failed: ${err.message}`);
          console.error(`[${id}] Sync failed:`, err.message);
        }
      }

      if (!skip_eval) {
        try {
          log.push(`[${id}] Starting compliance evaluation...`);
          const evalResult = await runComplianceEvaluation(id);
          accountResult.eval = evalResult;
          log.push(`[${id}] Eval complete: ${evalResult.evaluated} results, score ${evalResult.compliant}/${evalResult.evaluated}`);
          console.log(`[${id}] Eval complete:`, evalResult);
        } catch (err: any) {
          accountResult.eval = { error: err.message };
          log.push(`[${id}] Eval failed: ${err.message}`);
          console.error(`[${id}] Eval failed:`, err.message);
        }
      }

      results.push(accountResult);
    }

    return res.json({
      success: true,
      accounts_processed: accountIds.length,
      results,
      log,
      completed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/api/refresh', async (req, res) => {
  if (!authenticate(req, res)) return;

  const account_id = req.query.account_id as string | undefined;

  try {
    let accountIds: string[] = [];

    if (account_id) {
      accountIds = [account_id];
    } else {
      const { data: accounts, error } = await supabase
        .from('linode_accounts')
        .select('id, name');
      if (error) throw error;
      accountIds = (accounts || []).map((a: any) => a.id);
    }

    if (accountIds.length === 0) {
      return res.status(404).json({ error: 'No accounts found' });
    }

    const results: any[] = [];

    for (const id of accountIds) {
      const accountResult: any = { account_id: id, sync: null, eval: null };

      try {
        const syncResult = await fetchLinodeResources(id, (msg) => console.log(`[${id}] ${msg}`));
        accountResult.sync = syncResult;
      } catch (err: any) {
        accountResult.sync = { error: err.message };
      }

      try {
        const evalResult = await runComplianceEvaluation(id);
        accountResult.eval = evalResult;
      } catch (err: any) {
        accountResult.eval = { error: err.message };
      }

      results.push(accountResult);
    }

    return res.json({
      success: true,
      accounts_processed: accountIds.length,
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

const PORT = parseInt(process.env.API_PORT || '3001', 10);

app.listen(PORT, () => {
  console.log(`Compliance API server running on port ${PORT}`);
  console.log(`POST /api/refresh  — trigger sync + evaluation for all accounts`);
  console.log(`GET  /api/refresh  — same as POST but via query string`);
  console.log(`GET  /health       — health check`);
  if (API_SECRET) {
    console.log('Authentication: Bearer token required (REFRESH_API_SECRET is set)');
  } else {
    console.log('Authentication: DISABLED (set REFRESH_API_SECRET to enable)');
  }
});
