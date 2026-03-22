import chalk from 'chalk';
import fs from 'node:fs';
import { type GeodeReport } from './types.js';
import { categories } from './analyzers/index.js';

const catNames = new Map(categories.map(c => [c.key, c.name]));

function bar(score: number): string {
  const filled = Math.round(score);
  const empty = 10 - filled;
  const color = score >= 7 ? chalk.green : score >= 4 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function priorityLabel(p: string): string {
  if (p === 'high') return chalk.red('HIGH');
  if (p === 'medium') return chalk.yellow('MED ');
  return chalk.green('LOW ');
}

function scoreColor(score: number): string {
  const color = score >= 7 ? chalk.green : score >= 4 ? chalk.yellow : chalk.red;
  return color(score.toFixed(1));
}

export function printTerminal(report: GeodeReport): void {
  const w = Math.min(process.stdout.columns || 72, 72);
  const rule = chalk.gray('─'.repeat(w));

  console.log('');
  console.log(rule);
  console.log(chalk.bold('  geode') + chalk.gray(' — GEO Score Report'));
  console.log(chalk.gray(`  ${report.target}`));
  console.log(rule);
  console.log('');
  console.log(`  Overall Score: ${scoreColor(report.overall_score)} / 10`);
  console.log('');

  for (const [key, val] of Object.entries(report.categories)) {
    const name = catNames.get(key) ?? key;
    console.log(`  ${name.padEnd(22)} ${bar(val.score)}  ${scoreColor(val.score)}`);
  }

  console.log('');
  console.log(rule);
  console.log(chalk.bold('  Action Items'));
  console.log(rule);
  console.log('');

  const seen = new Set<string>();
  const top = report.actions_ranked.filter((a) => {
    if (seen.has(a.suggestion)) return false;
    seen.add(a.suggestion);
    return true;
  }).slice(0, 6);

  for (const a of top) {
    console.log(`  ${priorityLabel(a.priority)}  ${a.suggestion}`);
    console.log(chalk.gray(`        → ${a.location}`));
    console.log('');
  }

  console.log(rule);
  console.log(chalk.gray(`  ${report.metadata.categories_scored} categories scored in ${(report.metadata.duration_ms / 1000).toFixed(1)}s · ${report.metadata.provider}/${report.metadata.model}`));
  console.log('');
}

export function writeJson(report: GeodeReport, toFile: boolean): void {
  const json = JSON.stringify(report, null, 2);
  if (toFile) {
    try {
      fs.writeFileSync('geode-report.json', json);
      console.error(chalk.gray('  JSON report written to ./geode-report.json'));
    } catch (err: any) {
      console.error(chalk.yellow(`  Warning: Could not write geode-report.json: ${err.message}`));
    }
  } else {
    console.log(json);
  }
}
