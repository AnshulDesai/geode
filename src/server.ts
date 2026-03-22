import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './config.js';
import { fetchContent } from './fetcher.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { scoreContent, buildReport } from './scorer.js';
import type { LLMProvider } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache fetched HTML so proxy serves exactly what was scored
const htmlCache = new Map<string, string>();

export function startServer(port: number, cliFlags: Record<string, string | undefined>) {
  const app = express();
  app.use(express.json());

  // Serve static UI
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Proxy target page — serves cached HTML from scoring to avoid re-fetch/geolocation issues
  app.get('/api/proxy', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });
    try {
      let html = htmlCache.get(url);

      if (!html) {
        // Fallback: fetch if not cached yet (e.g. page loaded from history before scoring)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Geode/0.1 (+https://github.com/AnshulDesai/geode)',
            'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9',
          },
        });
        clearTimeout(timeout);
        html = await response.text();
      }

      // Rewrite relative URLs to absolute
      const base = new URL(url);
      html = html.replace(
        /<head([^>]*)>/i,
        `<head$1><base href="${base.origin}${base.pathname.replace(/\/[^/]*$/, '/')}">`,
      );

      // Inject highlight script
      html = html.replace('</body>', `<script>${getHighlightScript()}</script></body>`);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err: any) {
      res.status(502).json({ error: `Could not fetch: ${err.message}` });
    }
  });

  // Score endpoint
  app.post('/api/score', async (req, res) => {
    const { url, runs = 1 } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
      const config = resolveConfig(cliFlags);
      const provider: LLMProvider = config.provider === 'anthropic'
        ? new AnthropicProvider(config.apiKey, config.model)
        : new OpenAIProvider(config.apiKey, config.model);

      const content = await fetchContent(url);
      // Cache raw HTML so proxy serves the same content
      if (content.rawHtml) htmlCache.set(url, content.rawHtml);
      const start = Date.now();
      const numRuns = Math.min(Math.max(parseInt(runs, 10) || 1, 1), 5);
      let finalScored;

      if (numRuns === 1) {
        finalScored = await scoreContent(content.text, content.rawHtml, provider, false);
      } else {
        const allRuns: Awaited<ReturnType<typeof scoreContent>>[] = [];
        for (let r = 0; r < numRuns; r++) {
          allRuns.push(await scoreContent(content.text, content.rawHtml, provider, false));
        }
        finalScored = allRuns[0].map((cat, i) => {
          const valid = allRuns.map(run => run[i].result).filter(Boolean);
          if (!valid.length) return cat;
          const avg = Math.round((valid.reduce((s, r) => s + r!.score, 0) / valid.length) * 10) / 10;
          const seenSugg = new Set<string>();
          const actions = valid.flatMap(r => r!.actions).filter(a => {
            if (seenSugg.has(a.suggestion)) return false;
            seenSugg.add(a.suggestion); return true;
          });
          const findings = [...new Set(valid.flatMap(r => r!.findings))];
          return { ...cat, result: { score: avg, findings, actions } };
        });
      }

      const durationMs = Date.now() - start;
      const report = buildReport(url, finalScored, { provider: config.provider, model: config.model }, content.tokensEstimated, durationMs);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`\n  🪨 geode server running at http://localhost:${port}\n`);
  });
}

function getHighlightScript(): string {
  return `
    window.geodeHighlight = function(location) {
      // Remove previous highlights
      document.querySelectorAll('.geode-highlight').forEach(el => el.classList.remove('geode-highlight'));

      if (!location) return;

      // Try to find by heading text
      const clean = location.replace(/^§\\s*/, '').replace(/,\\s*paragraph.*$/i, '');
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let target = null;

      for (const h of headings) {
        if (h.textContent && h.textContent.toLowerCase().includes(clean.toLowerCase())) {
          target = h;
          break;
        }
      }

      // If no heading match, try text search across paragraphs
      if (!target) {
        const allEls = document.querySelectorAll('p, li, div, section, article');
        for (const el of allEls) {
          if (el.textContent && el.textContent.toLowerCase().includes(clean.toLowerCase())) {
            target = el;
            break;
          }
        }
      }

      if (target) {
        target.classList.add('geode-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    // Inject highlight styles + suppress loading bars
    const style = document.createElement('style');
    style.textContent = \`
      .geode-highlight {
        outline: 3px solid #c4a882 !important;
        outline-offset: 4px !important;
        background: rgba(196, 168, 130, 0.1) !important;
        border-radius: 4px !important;
        transition: outline-color 0.3s, background 0.3s !important;
      }
      /* Suppress common loading bars */
      #nprogress, .pace, .loading-bar, [role="progressbar"],
      .progress-bar, .nprogress-busy { display: none !important; }
    \`;
    document.head.appendChild(style);
  `;
}
