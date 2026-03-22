import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './config.js';
import { fetchContent } from './fetcher.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { BedrockProvider } from './providers/bedrock.js';
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

      // Strip CSP meta tags that block inline scripts
      html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');

      // Inject styles to disable clicks
      const injectCss = `<style>a, button, input, select, textarea, [onclick], [role="button"] { pointer-events: none !important; cursor: default !important; } #nprogress, .pace, .loading-bar, [role="progressbar"], .progress-bar, .nprogress-busy { display: none !important; }</style>`;
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, injectCss + '</head>');
      } else {
        html = injectCss + html;
      }

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err: any) {
      res.status(502).json({ error: `Could not fetch: ${err.message}` });
    }
  });

  // List available models for a provider
  app.get('/api/models', async (req, res) => {
    const provider = req.query.provider as string;
    const apiKey = req.query.apiKey as string;

    if (provider === 'bedrock') {
      const region = (req.query.region as string) || 'us-east-1';
      const models = await BedrockProvider.listModels(region);
      return res.json(models);
    }

    if (provider === 'anthropic') {
      const key = apiKey || resolveConfig(cliFlags).apiKey;
      if (!key) return res.json([]);
      try {
        const r = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        });
        if (!r.ok) return res.json([]);
        const data = await r.json() as { data: { id: string; display_name: string }[] };
        const models = data.data.map(m => m.id);
        return res.json(models);
      } catch {
        return res.json([]);
      }
    }

    // OpenAI
    const key = apiKey || resolveConfig(cliFlags).apiKey;
    if (!key) return res.json([]);

    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return res.json([]);
      const data = await r.json() as { data: { id: string }[] };
      const chat = data.data
        .map(m => m.id)
        .filter(id => {
          if (!/^gpt-/.test(id)) return false;
          if (/image|tts|transcribe|audio|realtime|instruct|search|codex|embed|16k/.test(id)) return false;
          if (/-(preview|latest)$/.test(id)) return false;
          if (/\d{4}/.test(id.replace(/^gpt-[\d.]+/, ''))) return false;
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
      res.json(chat);
    } catch {
      res.json([]);
    }
  });

  // Score endpoint
  app.post('/api/score', async (req, res) => {
    const { url, runs = 1, provider: reqProvider, model: reqModel, apiKey: reqKey } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
      // Use request values if provided, fall back to config
      const config = resolveConfig(cliFlags);
      const provider = reqProvider || config.provider;
      const model = reqModel || config.model;
      const apiKey = reqKey || config.apiKey;

      if (!apiKey) return res.status(400).json({ error: 'No API key configured. Add one in Settings.' });

      const llm: LLMProvider = provider === 'anthropic'
        ? new AnthropicProvider(apiKey, model)
        : provider === 'bedrock'
        ? new BedrockProvider(req.body.region || 'us-east-1', model)
        : new OpenAIProvider(apiKey, model);

      const content = await fetchContent(url);
      // Cache raw HTML so proxy serves the same content
      if (content.rawHtml) htmlCache.set(url, content.rawHtml);
      const start = Date.now();
      const numRuns = Math.min(Math.max(parseInt(runs, 10) || 1, 1), 5);
      let finalScored;

      if (numRuns === 1) {
        finalScored = await scoreContent(content.text, content.rawHtml, llm, false);
      } else {
        const allRuns: Awaited<ReturnType<typeof scoreContent>>[] = [];
        for (let r = 0; r < numRuns; r++) {
          allRuns.push(await scoreContent(content.text, content.rawHtml, llm, false));
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
      const report = buildReport(url, finalScored, { provider, model }, content.tokensEstimated, durationMs);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`\n  🪨 geode server running at http://localhost:${port}\n`);
  });
}

// Highlight script removed — overlay approach used instead from parent frame
