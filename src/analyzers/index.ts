import { type CategoryConfig } from '../types.js';
import { createAnalyzer } from './factory.js';

export const categories: CategoryConfig[] = [
  {
    name: 'Citability',
    key: 'citability',
    description: 'how easily an AI system could extract and quote this content in a generated answer',
    criteria: `- Self-contained paragraphs under 80 words that make sense when extracted
- Statistics with clear attribution
- Quotable standalone claims
- Specific data points an AI could cite`,
  },
  {
    name: 'Content Structure',
    key: 'content_structure',
    description: 'how easily AI can parse, navigate, and extract information from this content',
    criteria: `- Answer placed in the first 1-2 sentences of each section
- Clear H1 → H2 → H3 heading hierarchy
- Short paragraphs (under 100 words each)
- Bulleted or numbered lists for multi-part information
- FAQ section with question-based headings`,
  },
  {
    name: 'Authority Signals',
    key: 'authority_signals',
    description: 'how trustworthy and credible this content appears to an AI system selecting sources',
    criteria: `- Named author with credentials or bio
- Claims backed by cited sources (links, studies, data)
- References to recognized entities (organizations, publications)
- Original data, research, or unique expertise demonstrated
- E-E-A-T signals: experience, expertise, authoritativeness, trustworthiness`,
  },
  {
    name: 'Fluency & Clarity',
    key: 'fluency_clarity',
    description: 'how readable, skimmable, and clearly written this content is',
    criteria: `- Sentences are concise and readable (no run-ons, no jargon without explanation)
- Content is skimmable (key points visible without reading every word)
- Natural language (not keyword-stuffed or robotic)
- Consistent tone throughout
- Technical terms explained on first use`,
  },
];

export const analyzers = categories.map((c) => ({
  config: c,
  analyze: createAnalyzer(c),
}));
