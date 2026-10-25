import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

const EXTENSIONS = {
  js: 'js', javascript: 'js', mjs: 'mjs', cjs: 'cjs', ts: 'ts', typescript: 'ts',
  jsx: 'jsx', tsx: 'tsx', py: 'py', python: 'py', json: 'json', html: 'html', css: 'css',
  scss: 'scss', java: 'java', kt: 'kt', go: 'go', rs: 'rs', rust: 'rs', c: 'c', cpp: 'cpp',
  csharp: 'cs', cs: 'cs', php: 'php', rb: 'rb', ruby: 'rb', sh: 'sh', bash: 'sh', zsh: 'sh',
  sql: 'sql', yaml: 'yml', yml: 'yml', toml: 'toml', xml: 'xml', vue: 'vue', svelte: 'svelte', md: 'md', markdown: 'md',
  dockerfile: 'Dockerfile', makefile: 'Makefile',
};
const CODE_LANGS = new Set(Object.keys(EXTENSIONS));

function safeRelativePath(input) {
  const normalized = String(input ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter((p) => p && p !== '.' && p !== '..');
  return parts.join('/') || '';
}

function explicitPath(info) {
  const pathMatch = info.match(/(?:^|\s)(?:path|file|filename)\s*=\s*["']?([^"'\s]+)["']?/i);
  if (pathMatch) return safeRelativePath(pathMatch[1]);
  const tokens = info.split(/\s+/).slice(1);
  for (const token of tokens) {
    const cleaned = safeRelativePath(token.replace(/^["']|["']$/g, ''));
    if (cleaned && (cleaned.includes('/') || /\.[a-z0-9]{1,8}$/i.test(cleaned))) return cleaned;
  }
  return '';
}

export function extractCodeFiles(run) {
  // Only collect code blocks that explicitly name a real file. This prevents
  // explanatory snippets and examples from becoming dozens of snippet-NN files.
  const sources = [run.answer ?? ''];
  const files = new Map();
  for (const source of sources) {
    const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
      const info = match[1].trim();
      const language = (info.split(/\s+/)[0] ?? '').toLowerCase();
      if (!CODE_LANGS.has(language)) continue;
      const filename = explicitPath(info);
      if (!filename) continue;
      const content = match[2].replace(/^\n+|\n+$/g, '');
      if (!content.trim()) continue;
      files.set(filename, content + '\n');
    }
  }
  return [...files.entries()].map(([filePath, content]) => ({ path: filePath, content }));
}

export async function writeCodeZip(files, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = createWriteStream(destination);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    for (const file of files) archive.append(file.content, { name: file.path });
    archive.finalize().catch(reject);
  });
}

