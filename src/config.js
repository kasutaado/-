import process from 'node:process';

export const config = {
  baseURL: process.env.API_BASE_URL ?? 'https://api.voids.top/v1',
  apiKey: process.env.API_KEY ?? 'a',
  planner: process.env.MODEL_PLANNER ?? 'gpt-6-astra',
  researcher: process.env.MODEL_RESEARCHER ?? 'gemini-4-argon',
  coder: process.env.MODEL_CODER ?? 'kimi-k2.7-code',
  critic: process.env.MODEL_CRITIC ?? 'deepseek-v4-pro',
  synthesizer: process.env.MODEL_SYNTHESIZER ?? 'gpt-6.1-sol',
  maxConcurrency: Math.max(1, Number(process.env.MAX_CONCURRENCY ?? 4)),
  maxRetries: Math.max(0, Number(process.env.MAX_RETRIES ?? 3)),
  timeoutMs: Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS ?? 300000)),
};

export const MODEL_CATALOG = [
  'gemini-4-argon','gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash',
  'gemini-3.1-pro','gemini-3.1-pro-preview','gemini-3.1-flash-lite','gemini-3.1-flash-lite-preview',
  'gemini-3-flash','gemini-3-flash-preview','gemini-2.5-pro','gemini-3.1-pro-preview-vertex',
  'gemini-2.5-pro-vertex','gpt-6-astra','gpt-6.1-sol','gpt-6-sol','gpt-6-luna','gpt-5.6-sol',
  'gpt-5.6-terra','gpt-5.6-luna','gpt-5.5','gpt-5.4','gpt-5.4-mini','gpt-5','gpt-5-chat-latest',
  'gpt-4o','gpt-4o-2024-11-20','gpt-4.1-mini','gpt-4.1-nano','grok-4.7','grok-4-7','grok-4.6',
  'grok-4-6','grok-4-5','deepseek-v4.1-flash','deepseek-v4-pro','deepseek-v4-pro-0813',
  'kimi-k3','kimi-k2.7-code','kimi-k2.6','glm-5.3-flash','glm-5.3','glm-5.2','minimax-m3','qwen3.7-max'
];
