import { z } from 'zod';

export const ActionSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  suggestion: z.string(),
  location: z.string(),
});

export const CategoryResultSchema = z.object({
  score: z.number().min(1).max(10),
  findings: z.array(z.string()),
  actions: z.array(ActionSchema),
});

export type Action = z.infer<typeof ActionSchema>;
export type CategoryResult = z.infer<typeof CategoryResultSchema>;

export interface CategoryConfig {
  name: string;
  key: string;
  description: string;
  criteria: string;
  useRawHtml?: boolean;
}

export interface ScoredCategory {
  config: CategoryConfig;
  result: CategoryResult | null;
  error?: string;
}

export interface GeodeReport {
  version: string;
  target: string;
  timestamp: string;
  overall_score: number;
  categories: Record<string, CategoryResult>;
  actions_ranked: (Action & { category: string })[];
  metadata: {
    provider: string;
    model: string;
    categories_scored: number;
    categories_failed: number;
    duration_ms: number;
    content_tokens_estimated: number;
  };
}

export interface GeodeConfig {
  provider: 'openai' | 'anthropic' | 'bedrock';
  model: string;
  apiKey: string;
  output: 'terminal' | 'json' | 'both';
}

export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

export class GeodeRateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'GeodeRateLimitError';
  }
}
