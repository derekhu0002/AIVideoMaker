import { tool } from '@opencode-ai/plugin';

import { asJson, loadRuntimeState, summarizeState } from '../lib/runtimeState';

export default tool({
  description: 'Read the persisted OpenCode runtime status for the current project.',
  args: {
    section: tool.schema
      .string()
      .optional()
      .describe('Optional section to read: overview, tasks, validations, issues, or release.'),
  },
  async execute(args, context) {
    const state = loadRuntimeState(context.worktree);
    const summary = summarizeState(state);

    if (!args.section || args.section === 'overview') {
      return asJson(summary);
    }

    const selected = (summary as Record<string, unknown>)[args.section];
    return asJson({ section: args.section, value: selected ?? null, updatedAt: state.updatedAt });
  },
});