import { tool } from '@opencode-ai/plugin';

import { asJson, loadKnowledgeGraph, loadRuntimeState, safeSnippet } from '../lib/runtimeState';
import {
  getCanonicalKnowledgeGraphPath,
  loadCanonicalKnowledgeGraph,
  loadLegacyKnowledgeGraph,
  summarizeArchitectureCoverage,
  summarizeIntentionModel,
} from '../lib/sharedKnowledgeGraph';

type SearchMatch = {
  scope: 'runtime' | 'architecture';
  kind: string;
  id?: string;
  name?: string;
  type?: string;
  snippet: string;
};

function includesAllTerms(haystack: string, query: string): boolean {
  const value = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => value.includes(term));
}

export default tool({
  description: 'Query the architecture knowledge graph and the runtime project state using structured modes or free-text search.',
  args: {
    mode: tool.schema
      .string()
      .optional()
      .describe('Query mode: search, summary, task_by_id, tasks_by_status, issues, validations, architecture_element, or architecture_relationship.'),
    query: tool.schema.string().optional().describe('Search text, task ID, element name, or concept to look up.'),
    scope: tool.schema.string().optional().describe('all, runtime, or architecture. Used primarily with search mode.'),
    limit: tool.schema.number().int().min(1).max(50).optional().describe('Maximum number of matches to return.'),
    id: tool.schema.string().optional().describe('Task ID, issue ID, element ID, or relationship ID.'),
    status: tool.schema.string().optional().describe('Runtime task status filter: todo, in_progress, done, or blocked.'),
  },
  async execute(args, context) {
    const mode = args.mode ?? 'search';
    const runtimeState = loadRuntimeState(context.worktree);
    const canonicalGraph = loadCanonicalKnowledgeGraph(context.worktree);
    const legacyGraph = (loadLegacyKnowledgeGraph(context.worktree) ?? loadKnowledgeGraph(context.worktree)) as
      | { elements?: unknown[]; relationships?: unknown[] }
      | null;

    if (mode === 'summary') {
      const architectureCoverage = summarizeArchitectureCoverage(canonicalGraph);
      const intentionModel = summarizeIntentionModel(canonicalGraph);
      return asJson({
        sharedKnowledgeGraphPath: getCanonicalKnowledgeGraphPath(context.worktree),
        activeGoal: runtimeState.activeGoal,
        designSummary: runtimeState.designSummary,
        decisions: runtimeState.designDecisions,
        tasks: runtimeState.tasks,
        issues: runtimeState.issues,
        validations: runtimeState.validations,
        release: runtimeState.release,
        canonicalCounts: {
          elements: canonicalGraph.elements?.element.length ?? 0,
          relationships: canonicalGraph.relationships?.relationship.length ?? 0,
        },
        architectureCoverage,
        intentionModel,
      });
    }

    if (mode === 'task_by_id') {
      const task = runtimeState.tasks.find((item) => item.id === args.id || item.id === args.query);
      return asJson({ mode, task: task ?? null });
    }

    if (mode === 'tasks_by_status') {
      const status = (args.status ?? args.query ?? '').toLowerCase();
      const tasks = runtimeState.tasks.filter((item) => item.status === status);
      return asJson({ mode, status, tasks });
    }

    if (mode === 'issues') {
      const issues = args.id
        ? runtimeState.issues.filter((item) => item.id === args.id)
        : runtimeState.issues;
      return asJson({ mode, issues });
    }

    if (mode === 'validations') {
      return asJson({ mode, validations: runtimeState.validations });
    }

    if (mode === 'architecture_element') {
      const element = (canonicalGraph.elements?.element ?? []).find(
        (item) => item.identifier === (args.id ?? args.query) || item.name.some((entry) => entry.value === (args.query ?? ''))
      );
      if (element) {
        return asJson({ mode, source: 'canonical', element });
      }
      const legacyElements = Array.isArray(legacyGraph?.elements) ? (legacyGraph?.elements as Array<Record<string, unknown>>) : [];
      const legacyElement = legacyElements.find((item) => String(item.id ?? '') === (args.id ?? args.query) || String(item.name ?? '') === (args.query ?? ''));
      return asJson({ mode, source: legacyElement ? 'legacy' : 'none', element: legacyElement ?? null });
    }

    if (mode === 'architecture_relationship') {
      const relationship = (canonicalGraph.relationships?.relationship ?? []).find(
        (item) => item.identifier === (args.id ?? args.query) || item.name.some((entry) => entry.value === (args.query ?? ''))
      );
      if (relationship) {
        return asJson({ mode, source: 'canonical', relationship });
      }
      const legacyRelationships = Array.isArray(legacyGraph?.relationships) ? (legacyGraph?.relationships as Array<Record<string, unknown>>) : [];
      const legacyRelationship = legacyRelationships.find((item) => String(item.id ?? '') === (args.id ?? args.query) || String(item.name ?? '') === (args.query ?? ''));
      return asJson({ mode, source: legacyRelationship ? 'legacy' : 'none', relationship: legacyRelationship ?? null });
    }

    if (mode === 'architecture_elements_by_type') {
      const type = (args.status ?? args.query ?? '').trim();
      return asJson({
        mode,
        type,
        elements: (canonicalGraph.elements?.element ?? []).filter((item) => item.type === type),
      });
    }

    const scope = args.scope ?? 'all';
    const limit = args.limit ?? 10;
    const matches: SearchMatch[] = [];

    if (scope === 'all' || scope === 'runtime') {
      for (const task of runtimeState.tasks) {
        const text = `${task.id} ${task.title} ${task.status} ${task.summary ?? ''} ${task.details ?? ''}`;
        if (includesAllTerms(text, args.query ?? '')) {
          matches.push({
            scope: 'runtime',
            kind: 'task',
            id: task.id,
            name: task.title,
            type: task.status,
            snippet: safeSnippet(text),
          });
        }
      }

      for (const issue of runtimeState.issues) {
        const text = `${issue.id} ${issue.category} ${issue.summary} ${issue.details ?? ''}`;
        if (includesAllTerms(text, args.query ?? '')) {
          matches.push({
            scope: 'runtime',
            kind: 'issue',
            id: issue.id,
            name: issue.category,
            snippet: safeSnippet(text),
          });
        }
      }
    }

    if ((scope === 'all' || scope === 'architecture') && matches.length < limit) {
      const elements = canonicalGraph.elements?.element ?? [];
      const relationships = canonicalGraph.relationships?.relationship ?? [];

      for (const element of elements) {
        const text = `${element.identifier} ${element.name.map((item) => item.value).join(' ')} ${element.type} ${element.documentation?.map((item) => item.value).join(' ') ?? ''}`;
        if (includesAllTerms(text, args.query ?? '')) {
          matches.push({
            scope: 'architecture',
            kind: 'element',
            id: element.identifier,
            name: element.name.map((item) => item.value).join(' '),
            type: element.type,
            snippet: safeSnippet(text),
          });
        }
        if (matches.length >= limit) {
          break;
        }
      }

      if (matches.length < limit) {
        for (const relationship of relationships) {
          const text = `${relationship.identifier} ${relationship.name.map((item) => item.value).join(' ')} ${relationship.type} ${relationship.source} ${relationship.target} ${relationship.documentation?.map((item) => item.value).join(' ') ?? ''}`;
          if (includesAllTerms(text, args.query ?? '')) {
            matches.push({
              scope: 'architecture',
              kind: 'relationship',
              id: relationship.identifier,
              name: relationship.name.map((item) => item.value).join(' '),
              snippet: safeSnippet(text),
            });
          }
          if (matches.length >= limit) {
            break;
          }
        }
      }

      if (matches.length < limit) {
        const legacyElements = Array.isArray(legacyGraph?.elements) ? (legacyGraph.elements as Array<Record<string, unknown>>) : [];
        for (const legacyElement of legacyElements) {
          const text = `${String(legacyElement.id ?? '')} ${String(legacyElement.name ?? '')} ${String(legacyElement.type ?? '')} ${String(legacyElement.description ?? '')}`;
          if (includesAllTerms(text, args.query ?? '')) {
            matches.push({
              scope: 'architecture',
              kind: 'legacy_element',
              id: String(legacyElement.id ?? ''),
              name: String(legacyElement.name ?? ''),
              type: String(legacyElement.type ?? ''),
              snippet: safeSnippet(text),
            });
          }
          if (matches.length >= limit) {
            break;
          }
        }
      }

      if (matches.length < limit) {
        const legacyRelationships = Array.isArray(legacyGraph?.relationships)
          ? (legacyGraph.relationships as Array<Record<string, unknown>>)
          : [];
        for (const legacyRelationship of legacyRelationships) {
          const text = `${String(legacyRelationship.id ?? '')} ${String(legacyRelationship.statement ?? '')} ${String(legacyRelationship.name ?? '')} ${String(legacyRelationship.description ?? '')}`;
          if (includesAllTerms(text, args.query ?? '')) {
            matches.push({
              scope: 'architecture',
              kind: 'legacy_relationship',
              id: String(legacyRelationship.id ?? ''),
              name: String(legacyRelationship.name ?? ''),
              snippet: safeSnippet(text),
            });
          }
          if (matches.length >= limit) {
            break;
          }
        }
      }
    }

    return asJson({ mode: 'search', query: args.query ?? '', scope, matches: matches.slice(0, limit) });
  },
});