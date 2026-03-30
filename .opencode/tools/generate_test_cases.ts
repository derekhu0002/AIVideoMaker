import { tool } from '@opencode-ai/plugin';

import { loadRuntimeState } from '../lib/runtimeState';

export default tool({
  description: 'Generate a repo-local QA checklist from the current runtime tasks and optional objective text.',
  args: {
    objective: tool.schema.string().optional().describe('Optional testing objective or acceptance target.'),
  },
  async execute(args, context) {
    const state = loadRuntimeState(context.worktree);
    const tasks = state.tasks.length > 0 ? state.tasks : [];
    const lines: string[] = [];

    lines.push('# Generated Test Plan');
    lines.push('');
    if (args.objective) {
      lines.push(`Objective: ${args.objective}`);
      lines.push('');
    }

    for (const task of tasks) {
      lines.push(`## ${task.id} ${task.title}`);
      lines.push(`- Positive path: confirm the intended behavior for ${task.title}.`);
      lines.push(`- Negative path: verify invalid or missing input does not break ${task.title}.`);
      lines.push(`- Regression: ensure adjacent behavior still works after ${task.id}.`);
      lines.push('');
    }

    if (tasks.length === 0) {
      lines.push('- No runtime tasks were found. Validate the user-visible change directly and document the gap.');
      lines.push('');
    }

    return lines.join('\n');
  },
});