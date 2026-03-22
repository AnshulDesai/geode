import chalk from 'chalk';
import fs from 'node:fs';
import { type GeodeReport } from './types.js';

function bar(score: number): string {
  const filled = Math.round(score);
  const empty = 10 - filled;
  const color = score >= 7 ? chalk.green : score >= 4 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function priorityIcon(p: string): string {
  if (p === 'high') return chalk.red('🔴 HIGH');
  if (p === 'medium') return chalk.yellow('🟡 MED ');
  return chalk.green('🟢 LOW ');
}

export function printTerminal(report: GeodeReport): void {
  const w = 55;
  const line = '─'.repeat(w);

  console.log(chalk.bold(`\n┌${line}┐`));
  console.log(chalk.bold(`│  GEODE — GEO Score Report${' '.repeat(w - 26)}│`));
  console.log(chalk.bold(`│  ${report.target.slice(0, w - 4).padEnd(w - 3)}│`));
  console.log(`├${line}┤`);
  console.log(`│${' '.repeat(w)}│`);

  const scoreColor = report.overall_score >= 7 ? chalk.green : report.overall_score >= 4 ? chalk.yellow : chalk.red;
  console.log(`│  Overall Score: ${scoreColor(report.overall_score.toFixed(1))} / 10${' '.repeat(w - 27)}│`);
  console.log(`│${' '.repeat(w)}│`);

  for (const [key, val] of Object.entries(report.categories)) {
    const name = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).padEnd(22);
    const scoreLine = `  ${name}${bar(val.score)}  ${val.score.toFixed(1)}`;
    console.log(`│${scoreLine.padEnd(w)}│`);
  }

  console.log(`│${' '.repeat(w)}│`);
  console.log(`├${line}┤`);
  console.log(`│  TOP ACTION ITEMS${' '.repeat(w - 18)}│`);
  console.log(`├${line}┤`);
  console.log(`│${' '.repeat(w)}│`);

  const top = report.actions_ranked.slice(0, 6);
  for (const a of top) {
    const icon = priorityIcon(a.priority);
    const suggestion = a.suggestion.length > w - 14 ? a.suggestion.slice(0, w - 17) + '...' : a.suggestion;
    console.log(`│  ${icon}: ${suggestion.padEnd(w - 12)}│`);
    const loc = `     → ${a.location}`;
    console.log(`│${loc.slice(0, w).padEnd(w)}│`);
    console.log(`│${' '.repeat(w)}│`);
  }

  console.log(`└${line}┘`);
  console.log(chalk.gray(`  ${report.metadata.categories_scored} categories scored in ${(report.metadata.duration_ms / 1000).toFixed(1)}s | ${report.metadata.provider}/${report.metadata.model}\n`));
}

export function writeJson(report: GeodeReport, toFile: boolean): void {
  const json = JSON.stringify(report, null, 2);
  if (toFile) {
    try {
      fs.writeFileSync('geode-report.json', json);
      console.error(chalk.gray('JSON report written to ./geode-report.json'));
    } catch (err: any) {
      console.error(chalk.yellow(`Warning: Could not write geode-report.json: ${err.message}`));
    }
  } else {
    console.log(json);
  }
}
