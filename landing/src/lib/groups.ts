/**
 * Pipeline groups: README categories folded into the six stages of a RAG
 * system. Colours are the dataviz categorical slots stepped for the dark
 * surface and validated (scripts/validate_palette.js, --mode dark, surface
 * #06102a) in exactly this order: lightness band, chroma and normal-vision
 * floors pass; adjacent CVD sits in the 6-8 warn band for Serve/Operate, so
 * every use ships secondary encoding (gaps between groups + labelled legend).
 * Never reorder or cycle these.
 */
import { catalog, type Tool } from './catalog';

export interface PipelineGroup {
  id: string;
  name: string;
  color: string;
  categories: readonly string[];
}

export const GROUPS: readonly PipelineGroup[] = [
  {
    id: 'ingest',
    name: 'Ingest',
    color: '#c98500',
    categories: [
      'Data Ingestion & Parsing',
      'Chunking & Document Processing',
      'Data & Index Versioning',
    ],
  },
  {
    id: 'index',
    name: 'Index',
    color: '#3987e5',
    categories: [
      'Embedding Models',
      'Embedding Fine-tuning',
      'Vector Databases',
    ],
  },
  {
    id: 'retrieve',
    name: 'Retrieve',
    color: '#d95926',
    categories: [
      'Retrieval & Reranking',
      'Query Transformation & Routing',
      'Structured & SQL RAG',
      'Multimodal RAG',
    ],
  },
  {
    id: 'orchestrate',
    name: 'Orchestrate',
    color: '#9085e9',
    categories: [
      'Frameworks & Orchestration',
      'Agentic RAG',
      'Agent Memory & Stateful Context',
    ],
  },
  {
    id: 'serve',
    name: 'Serve',
    color: '#199e70',
    categories: [
      'Deployment & Serving',
      'Caching & Performance',
      'LLM Gateways & Routing',
      'FinOps & Cost Management',
    ],
  },
  {
    id: 'operate',
    name: 'Operate',
    color: '#e66767',
    categories: [
      'Evaluation & Benchmarking',
      'Observability & Tracing',
      'Security & Compliance',
    ],
  },
];

/** Categories added to the README later fold into a neutral "Other". */
export const OTHER_GROUP: PipelineGroup = {
  id: 'other',
  name: 'Other',
  color: '#7d8796',
  categories: [],
};

export function groupOf(category: string): PipelineGroup {
  return GROUPS.find((g) => g.categories.includes(category)) ?? OTHER_GROUP;
}

export interface PlacedTool extends Tool {
  category: string;
  anchor: string;
  group: PipelineGroup;
}

/** Each unique tool once, under the first category that lists it. */
export function uniqueTools(): PlacedTool[] {
  const seen = new Set<string>();
  const tools: PlacedTool[] = [];
  for (const category of catalog.categories) {
    for (const tool of category.tools) {
      const key = tool.url.replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tools.push({
        ...tool,
        category: category.name,
        anchor: category.anchor,
        group: groupOf(category.name),
      });
    }
  }
  return tools;
}

/** Groups in pipeline order with their tools; "Other" only when non-empty. */
export function toolsByGroup(): {
  group: PipelineGroup;
  tools: PlacedTool[];
}[] {
  const tools = uniqueTools();
  return [...GROUPS, OTHER_GROUP]
    .map((group) => ({
      group,
      tools: tools.filter((t) => t.group.id === group.id),
    }))
    .filter((entry) => entry.tools.length > 0);
}
