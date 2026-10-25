import fs from 'node:fs/promises';
import path from 'node:path';
import { makeId } from './utils.js';
import { extractCodeFiles, writeCodeZip } from './artifacts.js';

const DATA_DIR = path.resolve('data');
const RUNS_DIR = path.join(DATA_DIR, 'runs');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

async function ensure() {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  try { await fs.access(SESSIONS_FILE); }
  catch { await fs.writeFile(SESSIONS_FILE, '{}', 'utf8'); }
}
async function readSessions() {
  await ensure();
  try { return JSON.parse(await fs.readFile(SESSIONS_FILE, 'utf8')); }
  catch { return {}; }
}
export async function loadSession(id) {
  const all = await readSessions();
  return all[id] ?? [];
}
export async function saveSession(id, messages) {
  await ensure();
  const all = await readSessions();
  all[id] = messages;
  const tmp = `${SESSIONS_FILE}.${makeId()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(all, null, 2), 'utf8');
  await fs.rename(tmp, SESSIONS_FILE);
}

function makeRunReadme(run, codeFiles) {
  const files = codeFiles.length
    ? codeFiles.map((f) => `- \`${f.path}\``).join('\n')
    : '- コードファイルはありません。';
  return `# ${run.task || '生成コード'} の使い方\n\nこのREADMEはAIが生成したコード一式の利用案内です。\n\n## ファイル一覧\n\n${files}\n\n## セットアップと実行\n\n1. ZIPをプロジェクト用ディレクトリに展開してください。\n2. \`package.json\`、\`requirements.txt\`、\`pyproject.toml\` など依存関係の定義ファイルがある場合は、そのファイルに従って依存関係をインストールしてください。\n3. \`.env.example\` や設定ファイルがある場合は内容を確認し、必要な値を設定してください。秘密鍵やAPIキーをソースコードに直接書かず、環境変数で管理してください。\n4. エントリーポイントを確認して実行してください。実行コマンドが特定できる場合は、プロジェクト内の設定ファイルやコメントを参照してください。\n5. 実行前にコードを確認し、テスト環境で動作確認してください。\n\n## 注意事項\n\n- このコードはAIによる生成物であり、動作や安全性が保証されるものではありません。\n- ファイル名が明示されたコードブロックのみZIPに収録しています。ファイル名のないコード例は、不要なsnippetファイルを作らないため収録していません。\n`;
}

export async function saveRun(run) {
  await ensure();
  const runDir = path.join(RUNS_DIR, run.id);
  await fs.mkdir(runDir, { recursive: true });

  const extractedFiles = extractCodeFiles(run);
  const aiReadme = extractedFiles.find((f) => f.path.toLowerCase() === 'readme.md');
  const codeFiles = extractedFiles.filter((f) => f.path.toLowerCase() !== 'readme.md');
  const resultPath = path.join(runDir, 'result.json');
  const codeZipPath = path.join(runDir, 'code_artifacts.zip');

  run.artifacts = {
    directory: path.relative(process.cwd(), runDir),
    resultJson: 'result.json',
    codeZip: codeFiles.length ? 'code_artifacts.zip' : null,
    readme: codeFiles.length ? 'code_artifacts.zip/README.md' : null,
    codeFileCount: codeFiles.length,
    codeFiles: codeFiles.map((f) => f.path),
  };

  // Clean up artifacts from older versions so each run directory follows the
  // current layout and never retains the old standalone README/snippet ZIP.
  await fs.rm(path.join(runDir, 'README.md'), { force: true });
  await fs.rm(codeZipPath, { force: true });
  if (codeFiles.length) {
    const readme = aiReadme?.content ?? makeRunReadme(run, codeFiles);
    await writeCodeZip([...codeFiles, { path: 'README.md', content: readme }], codeZipPath);
  }
  await fs.writeFile(resultPath, JSON.stringify(run, null, 2), 'utf8');
  return runDir;
}

export async function listRuns(limit = 10) {
  await ensure();
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse().slice(0, limit);
  const runs = [];
  for (const id of dirs) {
    try {
      runs.push(JSON.parse(await fs.readFile(path.join(RUNS_DIR, id, 'result.json'), 'utf8')));
    } catch {
      // Ignore incomplete or non-run directories.
    }
  }
  return runs;
}
