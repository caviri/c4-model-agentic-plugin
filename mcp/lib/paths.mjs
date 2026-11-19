// Where the plugin's files are. The server reads them at startup (and again when they change), never copies them,
// so the MCP server, the explorer template and the docs cannot drift apart.
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

// mcp/lib → the repository root; C4_REPO_ROOT overrides it (a container that keeps the plugin elsewhere)
export const REPO_ROOT = resolve(process.env.C4_REPO_ROOT || join(here, '..', '..'));
export const MCP_ROOT = resolve(here, '..');

export const FILES = {
  template: join(REPO_ROOT, 'skills/architecture-explorer/templates/explorer.html'),
  dataModel: join(REPO_ROOT, 'skills/architecture-explorer/references/data-model.md'),
  rdfGraph: join(REPO_ROOT, 'skills/architecture-explorer/references/rdf-graph.md'),
  features: join(REPO_ROOT, 'skills/architecture-explorer/references/features.md'),
  exploreSkill: join(REPO_ROOT, 'skills/explore-project/SKILL.md'),
  playbook: join(REPO_ROOT, 'skills/explore-project/references/exploration-playbook.md'),
  questions: join(REPO_ROOT, 'skills/explore-project/references/questions.md'),
  briefTemplate: join(REPO_ROOT, 'skills/explore-project/references/project-brief-template.md'),
  c4: join(REPO_ROOT, 'ontology/c4.ttl'),
  c4View: join(REPO_ROOT, 'ontology/c4-view.ttl'),
  c4Shapes: join(REPO_ROOT, 'ontology/c4-shapes.ttl'),
  extending: join(REPO_ROOT, 'ontology/EXTENDING.md'),
  exampleModel: join(REPO_ROOT, 'examples/image-annotation-tool/communications/architecture-explorer/model.js'),
  exampleHistory: join(REPO_ROOT, 'examples/image-annotation-tool/communications/architecture-history/history.json'),
  historyCore: join(REPO_ROOT, 'skills/architecture-history/scripts/history-core.js'),
  method: join(MCP_ROOT, 'lib/method.md'),
  bridge: join(MCP_ROOT, 'widget/bridge.js'),
  widgetCss: join(MCP_ROOT, 'widget/widget.css'),
};

export function checkFiles() {
  const missing = Object.entries(FILES).filter(([, p]) => !existsSync(p)).map(([k, p]) => k + ': ' + p);
  if (missing.length) throw new Error('The MCP server cannot find files of the plugin (set C4_REPO_ROOT to the repository root):\n  ' + missing.join('\n  '));
}
