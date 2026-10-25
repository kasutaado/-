import readline from 'node:readline/promises';
import process from 'node:process';
import { config, MODEL_CATALOG } from './config.js';
import { listModels } from './client.js';
import { runTask } from './orchestrator.js';
import { loadSession, saveSession, listRuns } from './store.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const arg = process.argv[2];

async function main() {
  if (arg === 'models') {
    try { console.log(JSON.stringify(await listModels(), null, 2)); }
    catch (e) { console.error(`モデル一覧取得失敗: ${e.message}\n静的カタログ: ${MODEL_CATALOG.join(', ')}`); process.exitCode = 1; }
    return;
  }
  if (arg === 'history') {
    const runs = await listRuns();
    for (const r of runs) console.log(`${r.id} [${r.status}] ${r.startedAt} ${r.task.slice(0, 100)}`);
    return;
  }
  const task = process.argv.slice(2).join(' ') || await rl.question('依頼内容を入力してください: ');
  const sessionId = await rl.question('セッションID (空欄=default): ').then((s) => s.trim() || 'default');
  const prior = await loadSession(sessionId);
  console.log('\n--- マルチエージェント処理開始 ---');
  console.log(`Planner: ${config.planner} | Worker: ${config.researcher} | QA: ${config.critic} | Final: ${config.synthesizer}`);
  const run = await runTask({
    task: prior.length ? `継続コンテキスト:\n${prior.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n')}\n\n今回の依頼:\n${task}` : task,
    sessionId,
    onEvent: (e) => console.log(`[${e.type}] ${e.step_id ?? ''} ${e.message ?? ''}`),
  });
  if (run.status === 'completed') {
    console.log('\n--- 完成版 ---\n');
    console.log(run.answer);
    console.log(`\nQA score: ${run.review.score ?? 'N/A'} | 承認: ${run.review.approved ? 'yes' : 'no'}`);
    await saveSession(sessionId, [...prior, { role: 'user', content: task }, { role: 'assistant', content: run.answer }]);
    console.log(`Run ID: ${run.id}`);
  } else {
    console.error(`\n処理失敗: ${run.error}`);
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => rl.close());
