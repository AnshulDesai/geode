#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import { resolveConfig } from './config.js';
import { fetchContent } from './fetcher.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { scoreContent, buildReport } from './scorer.js';
import { printTerminal, writeJson } from './output.js';
import { startServer } from './server.js';
import type { LLMProvider } from './types.js';

const program = new Command();

program
  .name('geode')
  .description('Open-source GEO (Generative Engine Optimization) scorer. BYOK.')
  .version('0.1.0');

program
  .command('score')
  .description('Score a URL or file for GEO optimization')
  .argument('<target>', 'URL (http/https) or file path (.html, .md, .txt)')
  .option('--json', 'Output JSON to stdout')
  .option('--both', 'Terminal scorecard + JSON to ./geode-report.json')
  .option('--runs <n>', 'Average scores over N runs', '1')
  .option('--model <name>', 'Override model')
  .option('--provider <name>', 'Override provider: openai | anthropic')
  .option('--config <path>', 'Path to .geoderc config file')
  .option('--verbose', 'Show debug output')
  .action(async (target: string, opts: any) => {
    const outputMode = opts.json ? 'json' : opts.both ? 'both' : undefined;
    const config = resolveConfig({
      provider: opts.provider,
      model: opts.model,
      output: outputMode,
    });

    const provider: LLMProvider = config.provider === 'anthropic'
      ? new AnthropicProvider(config.apiKey, config.model)
      : new OpenAIProvider(config.apiKey, config.model);

    const spinner = ora('Fetching content...').start();

    const content = await fetchContent(target);
    spinner.text = 'Scoring...';

    const runs = parseInt(opts.runs, 10) || 1;
    const start = Date.now();
    let finalScored;

    if (runs === 1) {
      finalScored = await scoreContent(content.text, content.rawHtml, provider, opts.verbose, (done, total) => {
        spinner.text = `Scoring... [${done}/${total} categories complete]`;
      });
    } else {
      // Multi-run: average scores, deduplicate actions
      const allRuns: Awaited<ReturnType<typeof scoreContent>>[] = [];
      for (let r = 0; r < runs; r++) {
        spinner.text = `Run ${r + 1}/${runs}...`;
        allRuns.push(await scoreContent(content.text, content.rawHtml, provider, opts.verbose));
      }
      // Average scores per category, deduplicate actions by suggestion text
      finalScored = allRuns[0].map((cat, i) => {
        const validResults = allRuns.map((run) => run[i].result).filter(Boolean);
        if (validResults.length === 0) return cat;
        const avgScore = Math.round((validResults.reduce((s, r) => s + r!.score, 0) / validResults.length) * 10) / 10;
        const seenSuggestions = new Set<string>();
        const dedupedActions = validResults.flatMap((r) => r!.actions).filter((a) => {
          if (seenSuggestions.has(a.suggestion)) return false;
          seenSuggestions.add(a.suggestion);
          return true;
        });
        const allFindings = [...new Set(validResults.flatMap((r) => r!.findings))];
        return { ...cat, result: { score: avgScore, findings: allFindings, actions: dedupedActions } };
      });
    }

    const durationMs = Date.now() - start;
    spinner.stop();

    const scored = finalScored!.filter((s) => s.result).length;
    const failed = finalScored!.filter((s) => !s.result).length;

    if (scored === 0) {
      console.error('Error: All category evaluations failed. Check your API key and model, or try --verbose for details.');
      process.exit(1);
    }

    const report = buildReport(target, finalScored!, { provider: config.provider, model: config.model }, content.tokensEstimated, durationMs);
    const outMode = config.output;

    if (outMode === 'json') {
      writeJson(report, false);
    } else if (outMode === 'both') {
      printTerminal(report);
      writeJson(report, true);
    } else {
      printTerminal(report);
    }

    process.exit(failed > 0 ? 2 : 0);
  });

program
  .command('serve')
  .description('Start the geode web UI')
  .option('--port <n>', 'Port number', '3000')
  .option('--model <name>', 'Override model')
  .option('--provider <name>', 'Override provider: openai | anthropic')
  .action((opts: any) => {
    startServer(parseInt(opts.port, 10), { provider: opts.provider, model: opts.model });
  });

program.parse();
