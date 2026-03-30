import { tool } from '@opencode-ai/plugin';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { asJson, safeSnippet } from '../lib/runtimeState';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.venv', 'out', '.opencode/runtime']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.md']);

type ScanResult = {
  fileCount: number;
  extensionCounts: Record<string, number>;
  architectureReferences: Array<{ file: string; snippet: string }>;
  sampleFiles: string[];
};

function walkFiles(root: string, current: string, results: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || relative.startsWith('.opencode/node_modules')) {
        continue;
      }
      walkFiles(root, absolute, results);
      continue;
    }

    if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(relative);
    }
  }
}

export default tool({
  description: 'Scan the repository for implementation reality: source files, extension counts, and architecture trace markers.',
  args: {
    maxFiles: tool.schema.number().int().min(10).max(500).optional().describe('Maximum number of sample files to report.'),
  },
  async execute(args, context) {
    const files: string[] = [];
    walkFiles(context.worktree, context.worktree, files);

    const extensionCounts: Record<string, number> = {};
    const architectureReferences: Array<{ file: string; snippet: string }> = [];

    for (const relativeFile of files) {
      const extension = path.extname(relativeFile) || '<none>';
      extensionCounts[extension] = (extensionCounts[extension] ?? 0) + 1;

      const absolute = path.join(context.worktree, relativeFile);
      try {
        const content = fs.readFileSync(absolute, 'utf8');
        const match = content.match(/@ArchitectureID:\s*([^\r\n]+)/);
        if (match) {
          architectureReferences.push({
            file: relativeFile,
            snippet: safeSnippet(match[0]),
          });
        }
      } catch {
        // Ignore unreadable files and continue scanning.
      }
    }

    const result: ScanResult = {
      fileCount: files.length,
      extensionCounts,
      architectureReferences: architectureReferences.slice(0, 50),
      sampleFiles: files.slice(0, args.maxFiles ?? 80),
    };

    return asJson(result);
  },
});