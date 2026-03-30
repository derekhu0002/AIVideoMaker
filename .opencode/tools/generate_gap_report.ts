import { tool } from '@opencode-ai/plugin';

export default tool({
  description: 'Convert audit findings into a concise structured gap report for orchestrator and architect follow-up.',
  args: {
    intentSummary: tool.schema.string().describe('Summary of intended architecture or behavior.'),
    realitySummary: tool.schema.string().describe('Summary of observed implementation reality.'),
    gaps: tool.schema.string().describe('Gap list or discrepancy notes.'),
    recommendedActions: tool.schema.string().optional().describe('Optional recommended follow-up actions for architect or implementation.'),
  },
  async execute(args) {
    return [
      '# Gap Report',
      '',
      '## Intent',
      args.intentSummary,
      '',
      '## Reality',
      args.realitySummary,
      '',
      '## Gaps',
      args.gaps,
      ...(args.recommendedActions
        ? [
            '',
            '## Recommended Actions',
            args.recommendedActions,
          ]
        : []),
    ].join('\n');
  },
});