import { type CategoryResult, type LLMProvider, type ScoredCategory } from '../types.js';
import { categories } from './index.js';
import { createAnalyzer } from './factory.js';
import { quickScore } from './quick.js';

export async function deepScore(
  content: string,
  rawHtml: string,
  provider: LLMProvider,
  verbose: boolean,
): Promise<ScoredCategory[]> {
  // Pass 1: lite score all categories
  if (verbose) console.error('[deep] Pass 1: lite scoring all categories...');
  const liteResults = await quickScore(content, rawHtml, provider, verbose);

  // Find the 3 lowest-scoring categories
  const sorted = [...liteResults.entries()]
    .filter(([, r]) => r !== null)
    .sort((a, b) => a[1].score - b[1].score);
  const weakKeys = sorted.slice(0, 3).map(([key]) => key);

  if (verbose) console.error(`[deep] Pass 2: deep dive on ${weakKeys.join(', ')}...`);

  // Pass 2: re-score weak categories with dedicated prompts
  const deepResults = new Map<string, CategoryResult>();
  const promises = weakKeys.map(async (key) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return;
    const analyze = createAnalyzer(cat);
    const input = cat.useRawHtml && rawHtml ? rawHtml.slice(0, 12000) : content;
    try {
      const result = await analyze(input, provider, verbose);
      deepResults.set(key, result);
    } catch (err: any) {
      if (verbose) console.error(`[deep] ${key} failed:`, err.message);
    }
  });
  await Promise.allSettled(promises);

  // Merge: use deep results for weak categories, lite for the rest
  return categories.map(c => ({
    config: c,
    result: deepResults.get(c.key) ?? liteResults.get(c.key) ?? null,
    error: undefined,
  }));
}
