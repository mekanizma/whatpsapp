/**
 * Re-embed all active knowledge_base rows per company after an embedding model upgrade.
 *
 * Usage (local dev):
 *   npm run reindex:embeddings -- --confirm
 *   npm run reindex:embeddings -- --confirm --company <uuid>
 *
 * Usage (Coolify / Docker — only dist/ is in the image):
 *   cd /app/backend && npm run reindex:embeddings:prod -- --confirm
 */

import 'dotenv/config';
import { adminClient } from '../database/supabase';
import { indexKnowledgeItem } from '../services/knowledge-index.service';
import { clearCompanyCache } from '../ai/ai-cache.service';
import { config } from '../config';

const COMPANY_BACKOFF_MS = 3000;
const ITEM_BACKOFF_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): { confirm: boolean; companyId?: string } {
  const confirm = argv.includes('--confirm');
  const companyIdx = argv.indexOf('--company');
  const companyId =
    companyIdx >= 0 && argv[companyIdx + 1] ? argv[companyIdx + 1] : undefined;
  return { confirm, companyId };
}

async function listTargetCompanyIds(companyId?: string): Promise<string[]> {
  if (companyId) return [companyId];

  const { data, error } = await adminClient
    .from('knowledge_base')
    .select('company_id')
    .eq('is_active', true);

  if (error) throw new Error(error.message);

  return [...new Set((data || []).map((row) => row.company_id as string))];
}

async function reindexCompany(companyId: string): Promise<boolean> {
  const { data: rows, error } = await adminClient
    .from('knowledge_base')
    .select('id, title')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  if (!rows?.length) {
    console.log(`  (no active knowledge rows for ${companyId})`);
    return true;
  }

  console.log(`  ${rows.length} active KB row(s), model=${config.rag.embeddingModel}`);

  let allReady = true;

  for (const row of rows) {
    console.log(`  → indexing ${row.id} (${row.title})`);
    await indexKnowledgeItem(row.id, companyId);

    const { data: kb, error: statusError } = await adminClient
      .from('knowledge_base')
      .select('index_status, index_error')
      .eq('id', row.id)
      .eq('company_id', companyId)
      .single();

    if (statusError) {
      console.error(`    ✗ status check failed: ${statusError.message}`);
      allReady = false;
      continue;
    }

    if (kb?.index_status !== 'ready') {
      console.error(
        `    ✗ index_status=${kb?.index_status}${kb?.index_error ? ` (${kb.index_error})` : ''}`
      );
      allReady = false;
    } else {
      console.log(`    ✓ ready`);
    }

    await delay(ITEM_BACKOFF_MS);
  }

  return allReady;
}

async function main(): Promise<void> {
  const { confirm, companyId } = parseArgs(process.argv.slice(2));

  if (!confirm) {
    console.error('Refusing to run without --confirm (re-embeds all companies and clears AI cache).');
    console.error('  npm run reindex:embeddings -- --confirm [--company <uuid>]');
    console.error('  cd /app/backend && npm run reindex:embeddings:prod -- --confirm [--company <uuid>]');
    process.exit(1);
  }

  const companyIds = await listTargetCompanyIds(companyId);
  if (!companyIds.length) {
    console.log('No companies to reindex.');
    return;
  }

  console.log(
    `Reindexing ${companyIds.length} company/companies with ${config.rag.embeddingModel} (1536 dimensions)`
  );

  for (let i = 0; i < companyIds.length; i++) {
    const cid = companyIds[i];
    console.log(`\n[${i + 1}/${companyIds.length}] Company ${cid}`);

    try {
      const success = await reindexCompany(cid);
      if (success) {
        await clearCompanyCache(cid);
        console.log(`  ✓ cache cleared for ${cid}`);
      } else {
        console.warn(`  ⚠ partial failure — cache NOT cleared for ${cid}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ company failed: ${message}`);
    }

    if (i < companyIds.length - 1) {
      await delay(COMPANY_BACKOFF_MS);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Reindex failed:', err);
  process.exit(1);
});
