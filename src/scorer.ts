import { type ScoredCategory, type GeodeReport, type Action, GeodeRateLimitError, type LLMProvider } from './types.js';
import { analyzers } from './analyzers/index.js';

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30_000;
const MAX_RETRIES = 3;

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function runWithRetry(
  fn: () => Promise<any>,
  retries = MAX_RETRIES,
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GeodeRateLimitError && i < retries - 1) {
        const delay = Math.min(BACKOFF_BASE * 2 ** i, BACKOFF_MAX);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

export async function scoreContent(
  content: string,
  rawHtml: string,
  provider: LLMProvider,
  verbose: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<ScoredCategory[]> {
  const total = analyzers.length;

  // Phase 1: fire all concurrently
  const results = await Promise.allSettled(
    analyzers.map((a) => {
      const input = a.config.useRawHtml && rawHtml
        ? rawHtml.slice(0, 12000) // Cap raw HTML to avoid token explosion
        : content;
      return a.analyze(input, provider, verbose);
    }),
  );

  const scored: ScoredCategory[] = [];
  const retryIndices: number[] = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      scored[i] = { config: analyzers[i].config, result: r.value };
    } else if (r.reason instanceof GeodeRateLimitError) {
      retryIndices.push(i);
    } else {
      scored[i] = { config: analyzers[i].config, result: null, error: r.reason?.message ?? 'Unknown error' };
    }
  });

  onProgress?.(total - retryIndices.length, total);

  // Phase 2: retry rate-limited ones sequentially with backoff
  for (const i of retryIndices) {
    try {
      const input = analyzers[i].config.useRawHtml && rawHtml
        ? rawHtml.slice(0, 12000)
        : content;
      const result = await runWithRetry(() => analyzers[i].analyze(input, provider, verbose));
      scored[i] = { config: analyzers[i].config, result };
    } catch (err: any) {
      scored[i] = { config: analyzers[i].config, result: null, error: err.message };
    }
    onProgress?.(scored.filter((s) => s).length, total);
  }

  return scored;
}

export function buildReport(
  target: string,
  scored: ScoredCategory[],
  config: { provider: string; model: string },
  tokensEstimated: number,
  durationMs: number,
): GeodeReport {
  const categories: Record<string, any> = {};
  const allActions: (Action & { category: string })[] = [];
  let scoreSum = 0;
  let scoreCount = 0;
  let failed = 0;

  for (const s of scored) {
    if (s.result) {
      categories[s.config.key] = s.result;
      scoreSum += s.result.score;
      scoreCount++;
      for (const a of s.result.actions) {
        allActions.push({ ...a, category: s.config.key });
      }
    } else {
      failed++;
    }
  }

  // Sort: high → medium → low, then by worst category first
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const categoryScores = new Map(scored.filter((s) => s.result).map((s) => [s.config.key, s.result!.score]));
  allActions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return (categoryScores.get(a.category) ?? 10) - (categoryScores.get(b.category) ?? 10);
  });

  // Fuzzy dedup — remove actions that share 60%+ words with an earlier one
  const deduped: typeof allActions = [];
  for (const action of allActions) {
    const words = new Set(action.suggestion.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const isDupe = deduped.some(existing => {
      const existingWords = new Set(existing.suggestion.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const overlap = [...words].filter(w => existingWords.has(w)).length;
      return overlap / Math.min(words.size, existingWords.size) > 0.6;
    });
    if (!isDupe) deduped.push(action);
  }

  return {
    version: '0.1.0',
    target,
    timestamp: new Date().toISOString(),
    overall_score: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 0,
    categories,
    actions_ranked: deduped,
    metadata: {
      provider: config.provider,
      model: config.model,
      categories_scored: scoreCount,
      categories_failed: failed,
      duration_ms: durationMs,
      content_tokens_estimated: tokensEstimated,
    },
  };
}
