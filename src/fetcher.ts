import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ExtractedContent {
  text: string;
  title: string;
  tokensEstimated: number;
  truncated: boolean;
}

const MAX_TOKENS = 6000;
const TOKEN_RATIO = 1.35;

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * TOKEN_RATIO);
}

function truncateAtBoundary(text: string, maxWords: number): string {
  const paragraphs = text.split(/\n\n+/);
  let result = '';
  for (const p of paragraphs) {
    const candidate = result ? result + '\n\n' + p : p;
    if (candidate.split(/\s+/).length > maxWords) break;
    result = candidate;
  }
  if (!result) {
    // No paragraph break within range — truncate at sentence boundary
    const words = text.split(/\s+/).slice(0, maxWords);
    const joined = words.join(' ');
    const lastSentence = joined.lastIndexOf('.');
    return lastSentence > 0 ? joined.slice(0, lastSentence + 1) : joined;
  }
  return result;
}

function extractWithReadability(html: string, url?: string): { text: string; title: string } {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return {
    text: article?.textContent?.trim() ?? '',
    title: article?.title ?? '',
  };
}

export async function fetchContent(target: string): Promise<ExtractedContent> {
  let raw: string;
  let title = '';
  const isUrl = /^https?:\/\//i.test(target);

  if (isUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(target, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Geode/0.1 (+https://github.com/AnshulDesai/geode)' },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error(`Error: Could not fetch ${target} (HTTP ${res.status})`);
        process.exit(1);
      }
      const html = await res.text();
      const extracted = extractWithReadability(html, target);
      if (!extracted.text) {
        console.error('Warning: Page content appears empty. This may be a JS-rendered site. Try passing a local file instead.');
        process.exit(1);
      }
      raw = extracted.text;
      title = extracted.title;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        console.error(`Error: Request timed out fetching ${target}`);
      } else {
        console.error(`Error: Could not fetch ${target}: ${err.message}`);
      }
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(target)) {
      console.error(`Error: File not found: ${target}`);
      process.exit(1);
    }
    const content = fs.readFileSync(target, 'utf-8');
    const ext = path.extname(target).toLowerCase();

    if (ext === '.html' || ext === '.htm') {
      const extracted = extractWithReadability(content);
      raw = extracted.text;
      title = extracted.title;
    } else {
      // .md and everything else — pass as-is
      raw = content;
      title = path.basename(target);
      if (ext !== '.md' && ext !== '.txt') {
        console.warn(`Warning: Unknown file type (${ext}), treating as plain text.`);
      }
    }
  }

  const tokens = estimateTokens(raw);
  let truncated = false;
  if (tokens > MAX_TOKENS) {
    const maxWords = Math.floor(MAX_TOKENS / TOKEN_RATIO);
    raw = truncateAtBoundary(raw, maxWords);
    truncated = true;
    console.warn('Warning: Content truncated to ~6,000 tokens. Score reflects the first portion only.');
  }

  return { text: raw, title, tokensEstimated: estimateTokens(raw), truncated };
}
