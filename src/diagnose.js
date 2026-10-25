import { config } from './config.js';
import { complete, listModels } from './client.js';

const model = process.argv[2] || config.researcher;
console.log(`API base URL: ${config.baseURL}`);
console.log(`Model to test: ${model}`);
console.log(`Timeout: ${config.timeoutMs} ms`);
try {
  const started = Date.now();
  const models = await listModels();
  console.log(`models.list(): OK (${models.length} models, ${Date.now() - started} ms)`);
  console.log(`Model listed by API: ${models.some((m) => m.id === model)}`);
} catch (e) {
  console.error(`models.list(): FAILED — ${e.message}`);
}
try {
  const started = Date.now();
  const answer = await complete({
    model, temperature: 0,
    messages: [
      { role: 'system', content: 'Reply with exactly OK.' },
      { role: 'user', content: 'Return exactly OK. Do not explain.' },
    ],
  });
  console.log(`chat.completions.create(): OK (${Date.now() - started} ms)`);
  console.log(`Response: ${answer}`);
} catch (e) {
  console.error(`chat.completions.create(): FAILED — ${e.message}`);
  console.error('Check the API base URL, model ID, timeout, and provider response time.');
  process.exitCode = 1;
}
