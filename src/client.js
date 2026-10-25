import OpenAI from 'openai';
import { config } from './config.js';

export const client = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey,
  timeout: config.timeoutMs,
  maxRetries: 0, // retry policy is handled below
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function complete({ model, messages, temperature = 0.2, json = false }) {
  let lastError;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      });
      const content = response.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error(`モデル ${model} から空の応答が返りました`);
      }
      return content;
    } catch (error) {
      lastError = error;
      const status = error?.status;
      const message = String(error?.message ?? '');
      const isTimeout = /timed out|timeout|abort/i.test(message);
      const retryable = isTimeout || !status || status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt === config.maxRetries) break;
      // Timeouts can be transient; use exponential backoff before retrying.
      await sleep(Math.min((isTimeout ? 2500 : 1000) * (2 ** attempt), 15000) + Math.floor(Math.random() * 500));
    }
  }
  throw new Error(`API呼び出し失敗 (${model}): ${lastError?.message ?? lastError}`);
}

export async function listModels() {
  const response = await client.models.list();
  return (response.data ?? []).map((m) => ({ id: m.id, owned_by: m.owned_by }));
}
