export const STORAGE_KEY = "countdown-timers-v1";
export const MAX_TIMERS = 20;
export const MAX_NAME_LENGTH = 80;
const MAX_ID_LENGTH = 128;

function isValidIsoDate(value) {
  if (typeof value !== "string") return false;
  const epochMs = Date.parse(value);
  // Date.parseが許容する曖昧な形式を退け、UTCの正規ISO 8601形式だけを保存対象にする。
  return Number.isFinite(epochMs) && new Date(epochMs).toISOString() === value;
}

// 永続データは信用せず、必要な項目と型を満たすレコードだけを採用する。
export function sanitizeTimers(value) {
  if (!Array.isArray(value)) return [];

  const ids = new Set();
  const validTimers = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const id = typeof item.id === "string" ? item.id : "";
    if (!id || id.length > MAX_ID_LENGTH || ids.has(id)
      || !name || name.length > MAX_NAME_LENGTH || !isValidIsoDate(item.targetAt)
      || !isValidIsoDate(item.createdAt) || !isValidIsoDate(item.updatedAt)) continue;
    ids.add(id);
    validTimers.push({ id, name, targetAt: item.targetAt, createdAt: item.createdAt, updatedAt: item.updatedAt });
    if (validTimers.length === MAX_TIMERS) break;
  }
  return validTimers;
}

export function canAddTimer(timers) {
  return Array.isArray(timers) && timers.length < MAX_TIMERS;
}

// UIから独立したlocalStorageリポジトリ。失敗理由は呼び出し側が日本語表示する。
export function createTimerStorage(storage) {
  return {
    load() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return { timers: [], warning: "" };
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { timers: [], warning: "保存データを読み込めなかったため、安全な空の状態で開始しました。" };
        }
        const timers = sanitizeTimers(parsed);
        const warning = !Array.isArray(parsed) || timers.length !== parsed.length
          ? "一部の不正な保存データを除外しました。" : "";
        return { timers, warning };
      } catch (error) {
        throw new Error("端末内の保存領域を利用できません。Safariの設定をご確認ください。", { cause: error });
      }
    },

    save(timers) {
      const safe = sanitizeTimers(timers);
      if (safe.length !== timers.length) throw new Error("保存内容を検証できませんでした。再度お試しください。");
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(safe));
      } catch (error) {
        throw new Error("端末内に保存できませんでした。空き容量やSafariの設定をご確認ください。", { cause: error });
      }
      return safe;
    },
  };
}
