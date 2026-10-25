import { config } from './config.js';
import { complete } from './client.js';
import { parseJson, truncate } from './utils.js';

const asMessages = (system, user) => [
  { role: 'system', content: system },
  { role: 'user', content: user },
];

export async function planTask(task) {
  const raw = await complete({
    model: config.planner, temperature: 0.1, json: true,
    messages: asMessages(
      `あなたはマルチエージェントチームのテクニカル・プランナーです。
依頼を検証可能な作業単位に分解し、依存関係と完了条件を定義してください。
危険な推測は避け、必要な前提を明示します。出力はJSONのみ:
{"goal":"...","assumptions":["..."],"steps":[{"id":"S1","title":"...","objective":"...","deliverable":"...","acceptance_criteria":["..."],"depends_on":[]}],"risks":["..."]}`,
      task,
    ),
  });
  const plan = parseJson(raw);
  if (!Array.isArray(plan.steps) || !plan.steps.length) throw new Error('Plannerが有効な作業ステップを返しませんでした');
  plan.steps = plan.steps.map((s, i) => ({
    id: String(s.id ?? `S${i + 1}`),
    title: String(s.title ?? `作業 ${i + 1}`),
    objective: String(s.objective ?? ''),
    deliverable: String(s.deliverable ?? ''),
    acceptance_criteria: Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [],
    depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
  }));
  return { ...plan, steps: plan.steps };
}

export async function executeStep({ task, step, context }) {
  const raw = await complete({
    model: config.researcher, temperature: 0.25,
    messages: asMessages(
      `あなたは調査・分析担当エージェントです。
担当範囲だけを実行し、事実・推論・未確認事項を区別します。
依頼された成果物と受け入れ条件に沿って、根拠や検証方法を明記してください。
他のエージェントの結論を盲信せず、入力にない事実を作らないでください。`,
      `全体タスク:\n${task}\n\n担当ステップ:\n${JSON.stringify(step, null, 2)}\n\n前工程の成果:\n${truncate(JSON.stringify(context), 10000)}\n\nこのステップの成果物を作成してください。`,
    ),
  });
  return { step_id: step.id, agent: 'researcher', model: config.researcher, output: raw };
}

export async function reviewWork({ task, plan, outputs }) {
  const raw = await complete({
    model: config.critic, temperature: 0.1, json: true,
    messages: asMessages(
      `あなたは独立した品質保証（QA）担当です。
成果物を厳しく検査し、要件漏れ、論理矛盾、根拠のない断定、依存関係の欠落を指摘します。
重大な問題がなければapproved=true。修正指示は具体的に。
JSONのみ: {"approved":true,"score":0-100,"issues":[{"severity":"critical|major|minor","item":"...","fix":"..."}],"checks":["..."]}`,
      `依頼:\n${task}\n\n計画:\n${JSON.stringify(plan, null, 2)}\n\n成果:\n${truncate(JSON.stringify(outputs), 18000)}`,
    ),
  });
  return parseJson(raw);
}

export async function synthesize({ task, plan, outputs, review, previous }) {
  return complete({
    model: config.synthesizer, temperature: 0.2,
    messages: asMessages(
      `あなたは最終編集者・統合責任者です。
複数エージェントの出力を統合し、依頼に直接答える完成品を日本語で作成してください。
重複を削除し、矛盾は明示して解決または保留し、未検証の主張を事実として断定しないでください。
レビューの指摘は反映し、前回版がある場合は必要箇所を改善してください。
過程の説明より実用的な成果物を優先します。
依頼にプログラムやコードの作成が含まれる場合、成果物の各ファイルを必ず独立したMarkdownコードブロックで出力してください。
各コードブロックの開始行は、言語名に続けて path=相対ファイルパスを指定します（例: \`\`\`js path=src/index.js）。
複数ファイルの場合は、ファイルごとにコードブロックを分け、package.json、必要な設定ファイルに加えて、展開後のセットアップ・実行方法・必要な依存関係・注意事項を説明する使い方のREADME.mdも必ず生成してください。READMEは \`\`\`markdown path=README.md\n...\n\`\`\` の形式にしてください。
コード作成が依頼に含まれない場合は、この形式を無理に使用しないでください。`,
      `依頼:\n${task}\n\n計画:\n${JSON.stringify(plan, null, 2)}\n\n成果物:\n${truncate(JSON.stringify(outputs), 18000)}\n\nQAレビュー:\n${JSON.stringify(review, null, 2)}\n\n前回版:\n${truncate(previous ?? '(なし)', 10000)}\n\n完成版を出力してください。`,
    ),
  });
}

export async function reviseStep({ task, step, output, issues }) {
  return complete({
    model: config.coder, temperature: 0.15,
    messages: asMessages(
      `あなたは修正・実装専門エージェントです。指摘事項を優先して成果物を修正してください。
曖昧な仕様を勝手に補わず、修正内容と未解決点を明示します。`,
      `全体依頼:\n${task}\n\n対象ステップ:\n${JSON.stringify(step, null, 2)}\n\n元の成果:\n${truncate(output, 10000)}\n\nQA指摘:\n${JSON.stringify(issues, null, 2)}\n\n修正版を出力してください。`,
    ),
  });
}
