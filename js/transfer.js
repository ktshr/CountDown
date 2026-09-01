import { MAX_TIMERS, sanitizeTimers } from "./storage.js";

const TRANSFER_SCHEMA = "jst-countdown-timers";
const TRANSFER_VERSION = 1;
export const QR_PAYLOAD_PREFIX = "CDT1:";

function validateTimerArray(value) {
  if (!Array.isArray(value)) throw new Error("共有データにタイマー一覧がありません。");
  const timers = sanitizeTimers(value);
  if (timers.length !== value.length) throw new Error("共有データに不正なタイマーが含まれています。");
  return timers;
}

// JSONバックアップは読みやすさを保ち、将来の形式変更に備えて識別子と版を持たせる。
export function serializeTimers(timers, nowMs = Date.now()) {
  const safeTimers = validateTimerArray(timers);
  return JSON.stringify({
    schema: TRANSFER_SCHEMA,
    version: TRANSFER_VERSION,
    exportedAt: new Date(nowMs).toISOString(),
    timers: safeTimers,
  }, null, 2);
}

export function parseTimerJson(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error("JSONファイルを解析できませんでした。");
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("対応しているバックアップ形式ではありません。");
  }
  if (document.schema !== TRANSFER_SCHEMA || document.version !== TRANSFER_VERSION) {
    throw new Error("対応しているバックアップ形式またはバージョンではありません。");
  }
  return validateTimerArray(document.timers);
}

// QRでは日時をUTCミリ秒にしてキー名を省略し、容量を抑えながら全項目を保持する。
export function createQrPayload(timers) {
  const safeTimers = validateTimerArray(timers);
  const compactTimers = safeTimers.map((timer) => [
    timer.id,
    timer.name,
    Date.parse(timer.targetAt),
    Date.parse(timer.createdAt),
    Date.parse(timer.updatedAt),
  ]);
  return `${QR_PAYLOAD_PREFIX}${JSON.stringify(compactTimers)}`;
}

export function parseQrPayload(payload) {
  if (typeof payload !== "string" || !payload.startsWith(QR_PAYLOAD_PREFIX)) {
    throw new Error("このアプリで作成された共有QRコードではありません。");
  }

  let rows;
  try {
    rows = JSON.parse(payload.slice(QR_PAYLOAD_PREFIX.length));
  } catch {
    throw new Error("QRコード内の共有データを解析できませんでした。");
  }
  if (!Array.isArray(rows) || rows.length > MAX_TIMERS) {
    throw new Error("QRコード内のタイマー件数が不正です。");
  }

  const restored = rows.map((row) => {
    if (!Array.isArray(row) || row.length !== 5
      || !row.slice(2).every((value) => Number.isFinite(value))) return null;
    try {
      return {
        id: row[0],
        name: row[1],
        targetAt: new Date(row[2]).toISOString(),
        createdAt: new Date(row[3]).toISOString(),
        updatedAt: new Date(row[4]).toISOString(),
      };
    } catch {
      return null;
    }
  });
  return validateTimerArray(restored);
}

// 同じIDは更新日時が新しい方を採用し、新規IDは10件の範囲内で追加する。
export function mergeImportedTimers(currentTimers, importedTimers) {
  const current = validateTimerArray(currentTimers);
  const imported = validateTimerArray(importedTimers);
  const merged = new Map(current.map((timer) => [timer.id, timer]));
  const summary = { added: 0, updated: 0, unchanged: 0, omitted: 0 };

  for (const importedTimer of imported) {
    const currentTimer = merged.get(importedTimer.id);
    if (currentTimer) {
      if (importedTimer.updatedAt > currentTimer.updatedAt) {
        merged.set(importedTimer.id, importedTimer);
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }
      continue;
    }
    if (merged.size >= MAX_TIMERS) {
      summary.omitted += 1;
      continue;
    }
    merged.set(importedTimer.id, importedTimer);
    summary.added += 1;
  }

  return { timers: [...merged.values()], ...summary };
}
