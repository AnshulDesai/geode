# 🪨 Geode

Open-source GEO (Generative Engine Optimization) scorer. Bring your own API key.

Geode analyzes your content and tells you how well it's optimized for AI search engines like ChatGPT, Perplexity, Gemini, and Google AI Overviews — with specific, actionable suggestions to improve.

```
┌───────────────────────────────────────────────────────┐
│  GEODE — GEO Score Report                             │
│  https://www.paulgraham.com/greatwork.html            │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Overall Score: 3.8 / 10                              │
│                                                       │
│  Citability            ███░░░░░░░  3.0                │
│  Content Structure     ███░░░░░░░  3.0                │
│  Authority Signals     ███░░░░░░░  3.0                │
│  Fluency Clarity       ██████░░░░  6.0                │
│                                                       │
├───────────────────────────────────────────────────────┤
│  TOP ACTION ITEMS                                     │
│                                                       │
│  🔴 HIGH: Add headings to break up content            │
│  🔴 HIGH: Include author bio with credentials         │
│  🔴 HIGH: Cite sources to back up claims              │
│  🟡 MED:  Add FAQ section with question headings      │
└───────────────────────────────────────────────────────┘
  4 categories scored in 3.4s | openai/gpt-4o
```

## Why Geode?

- **BYOK** — Use your own OpenAI or Anthropic API key. No subscription, no SaaS.
- **AI-based scoring** — Your LLM evaluates the content, so scoring evolves as models improve.
- **Actionable** — Every suggestion points to a specific section with a concrete fix.
- **Open source** — MIT licensed. Free forever.

## Install

```bash
git clone https://github.com/AnshulDesai/geode.git
cd geode
npm install
npm run build
npm link
```

## Usage

```bash
# Set your API key
export OPENAI_API_KEY="sk-..."

# Score a URL
geode score https://example.com/blog/my-article

# Score a local file
geode score ./my-post.md

# JSON output
geode score https://example.com --json

# Terminal + JSON file
geode score https://example.com --both

# Use Anthropic instead
export ANTHROPIC_API_KEY="sk-ant-..."
geode score https://example.com --provider anthropic --model claude-sonnet-4-20250514

# Use a cheaper model
geode score https://example.com --model gpt-4o-mini

# Average over multiple runs for stability
geode score https://example.com --runs 3
```

## Scoring Categories

| Category | What It Measures |
|----------|-----------------|
| **Citability** | Can AI extract and quote your content? Self-contained paragraphs, statistics, quotable claims. |
| **Content Structure** | Can AI parse it? Answer-first formatting, heading hierarchy, FAQs, lists. |
| **Authority Signals** | Does it look trustworthy? Author credentials, cited sources, E-E-A-T signals. |
| **Fluency & Clarity** | Is it readable? Concise sentences, skimmable layout, natural language. |

Scoring is based on research from the [GEO paper (KDD 2024)](https://arxiv.org/pdf/2311.09735), First Page Sage's algorithm study, and current GEO best practices.

## Config

Create a `.geoderc` file (YAML) in your project or home directory:

```yaml
provider: openai
model: gpt-4o
api_key_env: OPENAI_API_KEY
output: terminal  # terminal | json | both
```

Resolution order: CLI flags → env vars → local `./.geoderc` → global `~/.geoderc` → defaults.

## Cost

Geode makes 4 LLM calls per run (one per category). Rough cost per article:

| Model | Cost per run |
|-------|-------------|
| gpt-4o-mini | ~$0.01 |
| claude-haiku | ~$0.02 |
| gpt-4o | ~$0.10 |
| claude-sonnet | ~$0.10 |

## Roadmap

- [x] CLI scorer with 4 categories
- [ ] Freshness, Schema & Technical, Topical Depth categories
- [ ] Custom category weights
- [ ] `--quick` mode (single prompt, ~5x cheaper)
- [ ] Batch mode (`--batch urls.txt`)
- [ ] CI/CD integration (GitHub Action)
- [ ] Historical tracking

## License

MIT
