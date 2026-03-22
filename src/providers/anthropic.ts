import Anthropic from '@anthropic-ai/sdk';
import { type LLMProvider, GeodeRateLimitError } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = res.content[0];
      return block.type === 'text' ? block.text : '';
    } catch (err: any) {
      if (err?.status === 429) {
        throw new GeodeRateLimitError();
      }
      throw err;
    }
  }
}
