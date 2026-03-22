import OpenAI from 'openai';
import { type LLMProvider, GeodeRateLimitError } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private apiKey: string;
  private mode: 'chat' | 'responses' | null = null;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(prompt: string): Promise<string> {
    // If we already know the mode, use it directly
    if (this.mode === 'responses') return this.viaResponses(prompt);
    if (this.mode === 'chat') return this.viaChat(prompt);

    // Try chat first
    try {
      const result = await this.viaChat(prompt);
      this.mode = 'chat';
      return result;
    } catch (err: any) {
      if (err instanceof GeodeRateLimitError) throw err;
      // Not a chat model — try responses API
      if (err?.status === 404) {
        try {
          const result = await this.viaResponses(prompt);
          this.mode = 'responses';
          return result;
        } catch (err2: any) {
          if (err2 instanceof GeodeRateLimitError) throw err2;
          throw err2;
        }
      }
      throw err;
    }
  }

  private async viaChat(prompt: string): Promise<string> {
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

  private async viaResponses(prompt: string): Promise<string> {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: prompt,
          max_output_tokens: 1024,
          reasoning: { effort: 'medium' },
        }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new GeodeRateLimitError();
        const body = await res.text();
        throw new Error(`Responses API error ${res.status}: ${body}`);
      }
      const data = await res.json() as any;
      // Extract text from output
      for (const item of data.output ?? []) {
        if (item.type === 'message') {
          for (const c of item.content ?? []) {
            if (c.type === 'output_text') return c.text;
          }
        }
      }
      return '';
    } catch (err: any) {
      if (err instanceof GeodeRateLimitError) throw err;
      throw err;
    }
  }
}
