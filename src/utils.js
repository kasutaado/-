export function parseJson(text) {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('モデル応答をJSONとして解析できませんでした');
  }
}

export function truncate(text, max = 14000) {
  return text.length > max ? `${text.slice(0, max)}\n...[省略]` : text;
}

export function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
