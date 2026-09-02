import { MAX_TIMERS, sanitizeTimers } from "./storage.js";

export const QR_PAYLOAD_PREFIX = "CDT1:";
// QRコードの最大版（Version 40）・誤り訂正Lで格納できるByteモードの上限。
const MAX_QR_PAYLOAD_BYTES = 2953;

function validateTimerArray(value) {
  if (!Array.isArray(value)) throw new Error("共有データにタイマー一覧がありません。");
  const timers = sanitizeTimers(value);
  if (timers.length !== value.length) throw new Error("共有データに不正なタイマーが含まれています。");
  return timers;
}

// QRでは日時をUTCミリ秒にしてキー名を省略し、容量を抑えながら全項目を保持する。
function compactTimers(timers) {
  return validateTimerArray(timers).map((timer) => [
    timer.id,
    timer.name,
    Date.parse(timer.targetAt),
    Date.parse(timer.createdAt),
    Date.parse(timer.updatedAt),
  ]);
}

// 1枚のQR容量を超えない最大件数まで、渡された順序でタイマーを収録する。
export function createQrShare(timers) {
  const rows = compactTimers(timers);
  const includedRows = [];

  for (const row of rows) {
    const candidate = [...includedRows, row];
    const candidatePayload = `${QR_PAYLOAD_PREFIX}${JSON.stringify(candidate)}`;
    if (new TextEncoder().encode(candidatePayload).length > MAX_QR_PAYLOAD_BYTES) {
      if (includedRows.length === 0) throw new Error("1件の登録内容がQRコードの容量を超えています。");
      break;
    }
    includedRows.push(row);
  }

  return {
    payload: `${QR_PAYLOAD_PREFIX}${JSON.stringify(includedRows)}`,
    includedCount: includedRows.length,
    omittedCount: rows.length - includedRows.length,
  };
}

function restoreTimers(rows) {
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
  return restoreTimers(rows);
}

// 同じIDは更新日時が新しい方を採用し、新規IDは登録上限の範囲内で追加する。
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
