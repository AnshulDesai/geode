import OpenAI from 'openai';
import { type LLMProvider, GeodeRateLimitError } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1024,
      });
      return res.choices[0]?.message?.content ?? '';
    } catch (err: any) {
      if (err?.status === 429 || err?.code === 'rate_limit_exceeded') {
        throw new GeodeRateLimitError();
      }
      throw err;
    }
  }
}
