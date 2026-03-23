import { type CategoryResult, type LLMProvider, CategoryResultSchema, GeodeRateLimitError } from '../types.js';
import { categories } from './index.js';
import { z } from 'zod';

const QuickResponseSchema = z.record(z.string(), CategoryResultSchema);

function buildQuickPrompt(content: string): string {
  const catList = categories.map(c =>
    `### ${c.name} (key: "${c.key}")\n${c.description}\n\nScore 1-10 based on:\n${c.criteria}`
  ).join('\n\n');

  return `You are a GEO (Generative Engine Optimization) analyst. Evaluate the following content across ALL 7 categories in a single pass.

## Scoring Scale (use the full range)
- 1-2: Fundamentally broken. Missing almost all signals.
- 3-4: Below average. Some basics present but major gaps.
- 5-6: Average. Meets some criteria but clear room for improvement.
- 7-8: Good. Most criteria met with minor gaps.
- 9-10: Excellent. Would be a model example for this category.

## Categories

${catList}

## Content to evaluate
---
${content}
---

## Response format
Respond in JSON only. No markdown fences, no explanation outside the JSON.
Return an object where each key is the category key and each value has score, findings, and actions.
For locations: quote an EXACT phrase (5-15 words) from the content prefixed with "near:". For source-code-only changes use "source: [description]".
Maximum 2 actions per category.

{
  "citability": { "score": <1-10>, "findings": ["..."], "actions": [{ "priority": "<high|medium|low>", "suggestion": "...", "location": "near: ..." }] },
  "content_structure": { ... },
  "authority_signals": { ... },
  "fluency_clarity": { ... },
  "freshness": { ... },
  "schema_technical": { ... },
  "topical_depth": { ... }
}`;
}

function parseJSON(raw: string): unknown {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function quickScore(
  content: string,
  rawHtml: string,
  provider: LLMProvider,
  verbose: boolean,
): Promise<Map<string, CategoryResult>> {
  // Lite mode sends content once; for schema_technical, append a truncated HTML snippet
  const schemaHint = rawHtml
    ? `\n\n--- RAW HTML (first 3000 chars for Schema & Technical evaluation) ---\n${rawHtml.slice(0, 3000)}`
    : '';

  const prompt = buildQuickPrompt(content + schemaHint);

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete(
      attempt === 0 ? prompt : prompt + '\n\nYou must respond with raw JSON only, no markdown formatting.'
    );

    try {
      const parsed = parseJSON(raw);
      const result = QuickResponseSchema.safeParse(parsed);
      if (result.success) return new Map(Object.entries(result.data));
      if (verbose) console.error('[quick] Validation failed:', result.error.message);
    } catch (err: any) {
      if (verbose) console.error(`[quick] Parse failed (attempt ${attempt + 1}):`, raw.slice(0, 200));
    }
  }

  throw new Error('Lite mode: evaluation failed after 2 attempts');
}
