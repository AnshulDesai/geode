import { type CategoryConfig } from '../types.js';
import { createAnalyzer } from './factory.js';

export const categories: CategoryConfig[] = [
  {
    name: 'Citability',
    key: 'citability',
    description: 'how easily an AI system could extract and quote this content in a generated answer',
    criteria: `- Are there self-contained paragraphs under 80 words that make sense when pulled out of context? (10 = most paragraphs work standalone; 1 = everything requires surrounding context)
- Are there specific statistics, numbers, or data points with clear attribution? (e.g. "increased by 24% according to [source]")
- Are there quotable standalone claims or definitions that an AI could directly cite?
- Does the content contain concrete examples, not just abstract advice?
- Could an AI copy-paste a paragraph into its answer and have it make sense to the reader?`,
  },
  {
    name: 'Content Structure',
    key: 'content_structure',
    description: 'how easily AI can parse, navigate, and extract information from this content',
    criteria: `- Is the key answer/definition placed in the first 1-2 sentences of each section, not buried at the end? (10 = answer-first throughout; 1 = key info buried in paragraphs)
- Is there a clear heading hierarchy (H1 → H2 → H3) that an AI could use as a table of contents?
- Are paragraphs short (under 100 words each) or are there walls of text?
- Are there bulleted/numbered lists for multi-part information?
- Is there an FAQ section or question-based headings that match how users query AI?
- Could an AI navigate to a specific subtopic using headings alone?`,
  },
  {
    name: 'Authority Signals',
    key: 'authority_signals',
    description: 'how trustworthy and credible this content appears to an AI system selecting sources',
    criteria: `- Is there a named author with credentials, title, or bio visible in the content? (10 = detailed author bio with expertise; 1 = no author attribution at all)
- Are claims backed by cited sources with links to studies, data, or authoritative references?
- Does the content reference recognized entities (companies, institutions, publications)?
- Is there original data, research, case studies, or first-hand expertise demonstrated?
- Are E-E-A-T signals present: experience (first-hand), expertise (credentials), authoritativeness (recognition), trustworthiness (transparency)?`,
  },
  {
    name: 'Fluency & Clarity',
    key: 'fluency_clarity',
    description: 'how readable, skimmable, and clearly written this content is',
    criteria: `- Are sentences concise (under 25 words on average) without run-ons or unnecessary jargon? (10 = crisp and clear throughout; 1 = dense, academic, or rambling)
- Is the content skimmable — could a reader get the key points by reading only headings and first sentences?
- Is the language natural and conversational, not keyword-stuffed or robotic?
- Is the tone consistent throughout (doesn't shift between formal and casual)?
- Are technical terms explained on first use?`,
  },
  {
    name: 'Freshness',
    key: 'freshness',
    description: 'how current and up-to-date this content appears to an AI system evaluating recency',
    criteria: `- Is there a visible publish date or "last updated" date? How recent is it? (10 = updated within last 3 months; 5 = within last year; 1 = no date or 2+ years old)
- Does the content reference recent events, data, or developments?
- Are there any stale references — outdated statistics, deprecated tools, dead links, or obsolete advice?
- Does temporal language signal currency ("in 2025", "as of Q1", "recently updated")?
- Are version numbers or product names current (not referencing old versions)?`,
  },
  {
    name: 'Schema & Technical',
    key: 'schema_technical',
    description: 'how machine-readable and technically accessible this content is to AI crawlers',
    criteria: `Evaluate the RAW HTML provided (not just the text content):
- Is there JSON-LD or microdata structured data (look for <script type="application/ld+json"> or itemscope/itemprop attributes)? (10 = rich schema markup; 1 = none at all)
- Are there proper meta tags (<meta name="description">, <meta name="author">, Open Graph tags)?
- Is the HTML semantic (proper <article>, <section>, <nav>, <header>, <h1>-<h6> tags vs just <div> soup)?
- Is there an FAQ schema, Article schema, or BreadcrumbList schema?
- Are images using alt text attributes?
- Is there any reference to robots.txt rules, sitemap, or llms.txt?

NOTE: You are evaluating the HTML source, not rendered content. Look for actual markup.`,
    useRawHtml: true,
  },
  {
    name: 'Topical Depth',
    key: 'topical_depth',
    description: 'how comprehensively this content covers its topic and related subtopics',
    criteria: `- Is the core topic thoroughly explained beyond surface level? (10 = definitive guide; 5 = decent overview; 1 = barely scratches the surface)
- Are related questions and subtopics addressed that a curious reader would ask next?
- Are key entities (people, companies, tools, concepts) in the space mentioned and contextualized?
- Is there comparison or contrast with alternatives or competing approaches?
- Would this single page satisfy someone who wants to fully understand the topic, or would they need to search again?`,
  },
];

export const analyzers = categories.map((c) => ({
  config: c,
  analyze: createAnalyzer(c),
}));
