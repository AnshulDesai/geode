import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { type GeodeConfig } from './types.js';

interface RawConfig {
  provider?: string;
  model?: string;
  api_key_env?: string;
  output?: string;
}

function loadYaml(filePath: string): RawConfig | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return yaml.load(content) as RawConfig;
  } catch {
    return null;
  }
}

const DEFAULTS: Record<string, string> = {
  provider: 'openai',
  model: 'gpt-4o',
  output: 'terminal',
};

const DEFAULT_KEY_ENVS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export function resolveConfig(cliFlags: Record<string, string | undefined>): GeodeConfig {
  // Resolution: CLI flags → env vars → local .geoderc → global ~/.geoderc → defaults
  const localConfig = loadYaml(path.resolve('.geoderc'));
  const globalConfig = loadYaml(path.join(process.env.HOME ?? '~', '.geoderc'));
  const fileConfig = { ...globalConfig, ...localConfig };

  const provider = (cliFlags.provider ?? process.env.GEODE_PROVIDER ?? fileConfig.provider ?? DEFAULTS.provider) as 'openai' | 'anthropic' | 'bedrock';
  const model = cliFlags.model ?? process.env.GEODE_MODEL ?? fileConfig.model ?? DEFAULTS.model;
  const output = (cliFlags.output ?? fileConfig.output ?? DEFAULTS.output) as GeodeConfig['output'];

  const keyEnv = fileConfig.api_key_env ?? DEFAULT_KEY_ENVS[provider] ?? '';
  const apiKey = process.env[keyEnv] ?? '';

  if (!apiKey && provider !== 'bedrock' && !process.env.GEODE_SERVE) {
    const expected = keyEnv || DEFAULT_KEY_ENVS[provider];
    console.error(`Error: ${expected} not found. Set the environment variable or configure api_key_env in .geoderc.`);
    process.exit(1);
  }

  return { provider, model, apiKey, output };
}
