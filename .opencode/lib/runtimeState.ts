import * as fs from 'node:fs';
import * as path from 'node:path';

export type RuntimeTaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type ValidationStatus = 'passed' | 'failed' | 'not_run';

export type RuntimeTask = {
  id: string;
  title: string;
  status: RuntimeTaskStatus;
  owner?: string;
  summary?: string;
  details?: string;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeValidation = {
  status: ValidationStatus;
  summary: string;
  updatedAt: string;
  details?: string;
};

export type RuntimeIssue = {
  id: string;
  category: string;
  summary: string;
  details?: string;
  createdAt: string;
};

export type RuntimeState = {
  version: number;
  activeGoal: string;
  designSummary: string;
  designDecisions: string[];
  tasks: RuntimeTask[];
  issues: RuntimeIssue[];
  validations: {
    qa: RuntimeValidation;
    audit: RuntimeValidation;
  };
  release: {
    status: 'not_started' | 'completed';
    summary: string;
    releaseLogPath?: string;
    updatedAt: string;
  };
  counters: {
    task: number;
    issue: number;
  };
  updatedAt: string;
};

const RUNTIME_DIR = path.join('.opencode', 'runtime');
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'project-state.json');
const GRAPH_UPDATE_LOG = path.join('.opencode', 'temp', 'opencode-graph-updates.jsonl');
const KG_FILE = path.join('.opencode', 'temp', 'SystemArchitecture.json');

export function getRuntimeFilePath(worktree: string): string {
  return path.join(worktree, RUNTIME_FILE);
}

export function getGraphUpdateLogPath(worktree: string): string {
  return path.join(worktree, GRAPH_UPDATE_LOG);
}

export function getKnowledgeGraphPath(worktree: string): string {
  return path.join(worktree, KG_FILE);
}

export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function defaultValidation(): RuntimeValidation {
  return {
    status: 'not_run',
    summary: 'No validation has been recorded yet.',
    updatedAt: new Date(0).toISOString(),
  };
}

export function createDefaultState(): RuntimeState {
  const now = new Date().toISOString();
  return {
    version: 1,
    activeGoal: '',
    designSummary: '',
    designDecisions: [],
    tasks: [],
    issues: [],
    validations: {
      qa: defaultValidation(),
      audit: defaultValidation(),
    },
    release: {
      status: 'not_started',
      summary: 'Release has not been prepared yet.',
      updatedAt: now,
    },
    counters: {
      task: 0,
      issue: 0,
    },
    updatedAt: now,
  };
}

export function loadRuntimeState(worktree: string): RuntimeState {
  const filePath = getRuntimeFilePath(worktree);
  if (!fs.existsSync(filePath)) {
    const state = createDefaultState();
    saveRuntimeState(worktree, state);
    return state;
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    const state = createDefaultState();
    saveRuntimeState(worktree, state);
    return state;
  }

  return JSON.parse(raw) as RuntimeState;
}

export function saveRuntimeState(worktree: string, state: RuntimeState): void {
  state.updatedAt = new Date().toISOString();
  const filePath = getRuntimeFilePath(worktree);
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

export function appendGraphUpdateLog(worktree: string, entry: Record<string, unknown>): void {
  const filePath = getGraphUpdateLogPath(worktree);
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

export function loadKnowledgeGraph(worktree: string): unknown {
  const graphPath = getKnowledgeGraphPath(worktree);
  if (!fs.existsSync(graphPath)) {
    return null;
  }
  const raw = fs.readFileSync(graphPath, 'utf8').trim();
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

export function summarizeState(state: RuntimeState): Record<string, unknown> {
  const counts = state.tasks.reduce<Record<string, number>>((accumulator, task) => {
    accumulator[task.status] = (accumulator[task.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    activeGoal: state.activeGoal,
    designSummary: state.designSummary,
    taskCounts: counts,
    tasks: state.tasks,
    issues: state.issues,
    validations: state.validations,
    release: state.release,
    updatedAt: state.updatedAt,
  };
}

export function nextTaskId(state: RuntimeState): string {
  state.counters.task += 1;
  return `TASK-${String(state.counters.task).padStart(3, '0')}`;
}

export function nextIssueId(state: RuntimeState): string {
  state.counters.issue += 1;
  return `ISSUE-${String(state.counters.issue).padStart(3, '0')}`;
}

export function normalizeTaskTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/^[-*\d.\s]+/, '').slice(0, 120);
}

export function extractGoalParts(goal: string, maxTasks: number): string[] {
  const lineParts = goal
    .split(/\r?\n/)
    .map((part) => normalizeTaskTitle(part))
    .filter(Boolean);

  if (lineParts.length >= 2) {
    return lineParts.slice(0, maxTasks);
  }

  return goal
    .split(/[.;\n]/)
    .map((part) => normalizeTaskTitle(part))
    .filter(Boolean)
    .slice(0, maxTasks);
}

export function safeSnippet(value: string, maxLength = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}