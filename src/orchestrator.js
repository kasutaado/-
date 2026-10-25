import { config } from './config.js';
import { planTask, executeStep, reviewWork, synthesize, reviseStep } from './agents.js';
import { makeId } from './utils.js';
import { saveRun } from './store.js';

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function validateDependencies(steps) {
  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    for (const dep of s.depends_on) {
      if (!ids.has(dep)) throw new Error(`${s.id} が存在しない依存先 ${dep} を参照しています`);
      if (dep === s.id) throw new Error(`${s.id} が自分自身に依存しています`);
    }
  }
  const visited = new Set(), active = new Set();
  function visit(id) {
    if (active.has(id)) throw new Error('計画の依存関係に循環があります');
    if (visited.has(id)) return;
    active.add(id);
    const step = steps.find((s) => s.id === id);
    for (const dep of step.depends_on) visit(dep);
    active.delete(id); visited.add(id);
  }
  for (const s of steps) visit(s.id);
}

async function runDAG(task, steps, events) {
  validateDependencies(steps);
  const pending = new Map(steps.map((s) => [s.id, s]));
  const completed = new Map();
  while (pending.size) {
    const ready = [...pending.values()].filter((s) => s.depends_on.every((id) => completed.has(id)));
    if (!ready.length) throw new Error('依存関係を満たすステップがなく、計画を進行できません');
    const results = await mapLimit(ready, config.maxConcurrency, async (step) => {
      events.push({ type: 'step_started', step_id: step.id, title: step.title, at: new Date().toISOString() });
      const context = step.depends_on.map((id) => ({ step: steps.find((s) => s.id === id), result: completed.get(id) }));
      const result = await executeStep({ task, step, context });
      events.push({ type: 'step_completed', step_id: step.id, at: new Date().toISOString() });
      return [step.id, result];
    });
    for (const [id, result] of results) { completed.set(id, result); pending.delete(id); }
  }
  return steps.map((s) => completed.get(s.id));
}

export async function runTask({ task, sessionId = 'default', onEvent = () => {} }) {
  if (!task?.trim()) throw new Error('タスクを入力してください');
  const run = {
    id: makeId(), sessionId, task, status: 'running',
    startedAt: new Date().toISOString(), events: [], plan: null, outputs: [], review: null, answer: null,
  };
  const emit = (event) => { run.events.push(event); onEvent(event); };
  try {
    emit({ type: 'planning', model: config.planner, at: new Date().toISOString() });
    run.plan = await planTask(task);
    emit({ type: 'plan_ready', steps: run.plan.steps.length, at: new Date().toISOString() });
    run.outputs = await runDAG(task, run.plan.steps, run.events);
    emit({ type: 'reviewing', model: config.critic, at: new Date().toISOString() });
    run.review = await reviewWork({ task, plan: run.plan, outputs: run.outputs });
    if (!run.review.approved || (run.review.issues ?? []).some((i) => i.severity === 'critical' || i.severity === 'major')) {
      emit({ type: 'revision', model: config.coder, at: new Date().toISOString() });
      const issues = run.review.issues ?? [];
      for (const issue of issues.filter((i) => i.severity === 'critical' || i.severity === 'major')) {
        const target = run.outputs.find((o) => o.step_id === issue.step_id) ?? run.outputs[0];
        const step = run.plan.steps.find((s) => s.id === target.step_id);
        target.output = await reviseStep({ task, step, output: target.output, issues: [issue] });
      }
      run.review = await reviewWork({ task, plan: run.plan, outputs: run.outputs });
    }
    emit({ type: 'synthesizing', model: config.synthesizer, at: new Date().toISOString() });
    run.answer = await synthesize({ task, plan: run.plan, outputs: run.outputs, review: run.review });
    run.status = 'completed';
  } catch (error) {
    run.status = 'failed';
    run.error = error?.message ?? String(error);
    emit({ type: 'error', message: run.error, at: new Date().toISOString() });
  } finally {
    run.finishedAt = new Date().toISOString();
    await saveRun(run);
  }
  return run;
}
