import * as cheerio from 'cheerio';
import type { LLMProvider } from './types.js';

interface TextSection { index: number; path: string; text: string; }

interface Action { priority: string; suggestion: string; location: string; category: string; }

function extractSections(html: string): { $: cheerio.CheerioAPI; sections: TextSection[] } {
  const $ = cheerio.load(html);
  const sections: TextSection[] = [];
  $('h1,h2,h3,h4,h5,h6,p,li,figcaption,blockquote,td,th,caption').each((i, el) => {
    const text = $(el).text().trim();
    if (!text || text.length < 5) return;
    sections.push({ index: sections.length, path: `${(el as any).parentNode?.tagName || ''}>${(el as any).tagName}[${i}]`, text });
  });
  return { $, sections };
}

function buildPrompt(sections: TextSection[], actions: Action[], fullText: string): string {
  const actionList = actions.map((a, i) => `${i + 1}. [${a.priority.toUpperCase()}] ${a.suggestion} (location: ${a.location})`).join('\n');
  const sectionList = sections.map(s => `[${s.index}] (${s.path}): ${s.text}`).join('\n');

  return `You are a content optimization expert. Below is the full page text, numbered text sections, and action items to fix.

## Full Page Text (for context — use real names, dates, and facts from here)
${fullText.slice(0, 8000)}

## Action Items
${actionList}

## Current Text Sections
${sectionList}

## Rules
- Only patch sections DIRECTLY related to an action item. Do NOT rewrite sections that are already good.
- Preserve all existing inline HTML (links, bold, images, spans) in your replacement text.
- SKIP action items that require information not present anywhere on the page. Only use placeholder brackets for information truly absent from the content. If the author name, title, or credentials appear anywhere in the page text, USE them.
- Focus on: restructuring text for clarity, adding FAQ sections from existing content, improving headings, adding schema/meta tags from existing page data, improving paragraph structure for citability.

## Response format (JSON only, no markdown fences)
{
  "patches": [{"index": <section number>, "text": "<replacement text keeping inline HTML>"}],
  "head_additions": ["<script type=\\"application/ld+json\\">...</script>", "<meta ...>"],
  "new_elements": [{"after_index": <section number>, "html": "<p>New content</p>"}]
}

Only include patches for sections that need changes. Empty arrays if nothing needed.`;
}

function applyPatches($: cheerio.CheerioAPI, sections: TextSection[], patches: {index: number; text: string}[], headAdditions: string[], newElements: {after_index: number; html: string}[]): string {
  const els = $('h1,h2,h3,h4,h5,h6,p,li,figcaption,blockquote,td,th,caption').toArray();
  const sectionToEl = new Map<number, number>();
  let sIdx = 0;
  els.forEach((el, eIdx) => {
    const text = $(el).text().trim();
    if (!text || text.length < 5) return;
    sectionToEl.set(sIdx++, eIdx);
  });

  for (const patch of patches) {
    const elIdx = sectionToEl.get(patch.index);
    if (elIdx !== undefined && els[elIdx]) $(els[elIdx]).html(patch.text);
  }
  for (const ne of newElements) {
    const elIdx = sectionToEl.get(ne.after_index);
    if (elIdx !== undefined && els[elIdx]) $(els[elIdx]).after(ne.html);
  }
  if (headAdditions.length > 0) {
    const head = $('head');
    for (const a of headAdditions) head.append(a);
  }
  return $.html();
}

export async function rewriteContent(html: string, extractedText: string, actions: Action[], provider: LLMProvider): Promise<string> {
  const { $, sections } = extractSections(html);
  const prompt = buildPrompt(sections, actions, extractedText);
  const raw = await provider.complete(prompt);

  const cleaned = raw.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  return applyPatches($, sections, parsed.patches || [], parsed.head_additions || [], parsed.new_elements || []);
}
