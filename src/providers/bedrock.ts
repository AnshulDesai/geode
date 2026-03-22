import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockClient, ListInferenceProfilesCommand } from '@aws-sdk/client-bedrock';
import { type LLMProvider, GeodeRateLimitError } from '../types.js';

export class BedrockProvider implements LLMProvider {
  private client: BedrockRuntimeClient;
  private model: string;

  constructor(region: string, model: string) {
    this.client = new BedrockRuntimeClient({ region });
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    try {
      const command = new ConverseCommand({
        modelId: this.model,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 16384, temperature: 0 },
      });

      const response = await this.client.send(command);
      const block = response.output?.message?.content?.[0];
      return block && 'text' in block ? block.text ?? '' : '';
    } catch (err: any) {
      if (err.name === 'ThrottlingException' || err.$metadata?.httpStatusCode === 429) {
        throw new GeodeRateLimitError();
      }
      throw err;
    }
  }

  static async listModels(region: string): Promise<string[]> {
    try {
      const client = new BedrockClient({ region });
      const command = new ListInferenceProfilesCommand({});
      const response = await client.send(command);
      return (response.inferenceProfileSummaries ?? [])
        .filter(p => p.status === 'ACTIVE' && p.type === 'SYSTEM_DEFINED')
        .map(p => p.inferenceProfileId!)
        .filter(Boolean)
        .sort((a, b) => {
          // Regional (us.) before global
          const aRegional = a.startsWith('us.') ? 0 : 1;
          const bRegional = b.startsWith('us.') ? 0 : 1;
          if (aRegional !== bRegional) return aRegional - bRegional;
          return a.localeCompare(b);
        });
    } catch {
      return [];
    }
  }
}
