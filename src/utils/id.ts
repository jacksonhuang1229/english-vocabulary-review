/**
 * 產生唯一 ID。
 * 注意：手機透過區域網路 HTTP 開啟網站時，部分瀏覽器不提供 crypto.randomUUID()，
 * 因此加上安全的隨機 fallback。
 */
export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}
