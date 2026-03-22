import { type CategoryConfig, type CategoryResult, type LLMProvider, CategoryResultSchema, GeodeRateLimitError } from '../types.js';

function buildPrompt(config: CategoryConfig, content: string): string {
  return `You are a GEO (Generative Engine Optimization) analyst evaluating content for AI search visibility.

Evaluate the following content on ${config.name} — ${config.description}.

Score 1-10 based on:
${config.criteria}

Content:
---
${content}
---

Respond in JSON only. No markdown, no explanation, just the JSON object:
{
  "score": <1-10>,
  "findings": ["<specific observation about the content>"],
  "actions": [
    {
      "priority": "<high|medium|low>",
      "suggestion": "<specific actionable fix>",
      "location": "<heading or section where this applies, e.g. '§ Introduction' or '§ Pricing, paragraph 2'>"
    }
  ]
}`;
}

function parseJSON(raw: string): unknown {
  // Strip markdown fences
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  // Find first { to last }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found');
  cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

export function createAnalyzer(config: CategoryConfig) {
  return async function analyze(content: string, provider: LLMProvider, verbose: boolean): Promise<CategoryResult> {
    const prompt = buildPrompt(config, content);

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await provider.complete(
        attempt === 0 ? prompt : prompt + '\n\nYou must respond with raw JSON only, no markdown formatting.'
      );

      try {
        const parsed = parseJSON(raw);
        const result = CategoryResultSchema.safeParse(parsed);
        if (result.success) return result.data;
        if (verbose) console.error(`[${config.key}] Validation failed:`, result.error.message);
      } catch (err: any) {
        if (verbose) console.error(`[${config.key}] Parse failed (attempt ${attempt + 1}):`, raw.slice(0, 200));
      }
    }

    throw new Error(`Category ${config.name}: evaluation failed after 2 attempts`);
  };
}
