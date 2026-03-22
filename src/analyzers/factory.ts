import { type CategoryConfig, type CategoryResult, type LLMProvider, CategoryResultSchema } from '../types.js';

function buildPrompt(config: CategoryConfig, content: string): string {
  return `You are a GEO (Generative Engine Optimization) analyst. Your job is to evaluate how well content is optimized for being cited by AI search engines (ChatGPT, Perplexity, Gemini, Google AI Overviews).

Evaluate the following content on ${config.name} — ${config.description}.

## Scoring Scale (use the full range)
- 1-2: Fundamentally broken. Missing almost all signals.
- 3-4: Below average. Some basics present but major gaps.
- 5-6: Average. Meets some criteria but clear room for improvement.
- 7-8: Good. Most criteria met with minor gaps.
- 9-10: Excellent. Would be a model example for this category.

## Criteria
${config.criteria}

## Content to evaluate
---
${content}
---

## Response format
Respond in JSON only. No markdown fences, no explanation outside the JSON.

IMPORTANT for actions:
- Each suggestion must be SPECIFIC and DIFFERENT from other suggestions
- For location: quote an EXACT phrase (5-15 words) from the content that appears near where the change should be made. Use the format: "near: [exact quote from content]"
- If the change involves adding something new, quote the nearest existing text where it should be inserted
- If no relevant text exists (e.g. schema/meta changes), use "source: [description]"
- Maximum 4 actions, prioritize the highest-impact fixes

{
  "score": <1-10>,
  "findings": ["<specific observation with evidence from the content>"],
  "actions": [
    {
      "priority": "<high|medium|low>",
      "suggestion": "<specific, actionable fix — what exactly to change>",
      "location": "<exact quote (5-15 words) from the content near where this applies, prefixed with 'near:' — e.g. 'near: I started blogging back in 2009'. For source-code-only changes use 'source: head section'>"
    }
  ]
}`;
}

function parseJSON(raw: string): unknown {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
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
