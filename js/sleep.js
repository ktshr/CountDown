export const SLEEP_STORAGE_KEY = "countdown-sleep-settings-v1";
export const DEFAULT_SLEEP_SETTINGS = Object.freeze({
  enabled: false,
  start: "23:00",
  end: "06:00",
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function parseTimeMinutes(value) {
  if (typeof value !== "string") return Number.NaN;
  const match = TIME_PATTERN.exec(value);
  if (!match) return Number.NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : Number.NaN;
}

export function validateSleepSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, message: "睡眠時間の設定形式が不正です。" };
  }
  const startMinutes = parseTimeMinutes(value.start);
  const endMinutes = parseTimeMinutes(value.end);
  if (typeof value.enabled !== "boolean" || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return { valid: false, message: "正しい睡眠時間を入力してください。" };
  }
  if (value.enabled && startMinutes === endMinutes) {
    return { valid: false, message: "就寝時刻と起床時刻は異なる時刻にしてください。" };
  }
  return { valid: true, message: "" };
}

function normalizeSleepSettings(value) {
  const validation = validateSleepSettings(value);
  if (!validation.valid) return null;
  return { enabled: value.enabled, start: value.start, end: value.end };
}

// JSTはUTC+9で固定されるため、UTC時刻へ9時間を加えた連続軸上で日ごとの睡眠帯を数える。
function elapsedSleepMs(jstEpochMs, startMs, durationMs) {
  const relativeMs = jstEpochMs - startMs;
  const completeDays = Math.floor(relativeMs / DAY_MS);
  const remainderMs = relativeMs - completeDays * DAY_MS;
  return completeDays * durationMs + Math.min(remainderMs, durationMs);
}

export function getAwakeDurationMs(startEpochMs, endEpochMs, settings) {
  const totalMs = Math.max(0, endEpochMs - startEpochMs);
  if (totalMs === 0 || !settings?.enabled) return totalMs;

  const startMinutes = parseTimeMinutes(settings.start);
  const endMinutes = parseTimeMinutes(settings.end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes === endMinutes) {
    return totalMs;
  }

  const sleepDurationMinutes = (endMinutes - startMinutes + 24 * 60) % (24 * 60);
  const sleepDurationMs = sleepDurationMinutes * MINUTE_MS;
  const sleepStartMs = startMinutes * MINUTE_MS;
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const rangeStart = startEpochMs + jstOffsetMs;
  const rangeEnd = endEpochMs + jstOffsetMs;
  const sleepingMs = elapsedSleepMs(rangeEnd, sleepStartMs, sleepDurationMs)
    - elapsedSleepMs(rangeStart, sleepStartMs, sleepDurationMs);
  return Math.max(0, totalMs - sleepingMs);
}

export function formatSleepSchedule(settings) {
  if (!settings.enabled) return "睡眠時間を差し引かない";
  const startMinutes = parseTimeMinutes(settings.start);
  const endMinutes = parseTimeMinutes(settings.end);
  const nextDay = endMinutes <= startMinutes ? "翌" : "";
  return `${settings.start}〜${nextDay}${settings.end}を差し引く`;
}

export function createSleepSettingsStorage(storage) {
  return {
    load() {
      try {
        const raw = storage.getItem(SLEEP_STORAGE_KEY);
        if (raw === null) return { settings: { ...DEFAULT_SLEEP_SETTINGS }, warning: "" };
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { settings: { ...DEFAULT_SLEEP_SETTINGS }, warning: "睡眠時間の保存データを読み込めなかったため、初期設定を使用します。" };
        }
        const settings = normalizeSleepSettings(parsed);
        return settings
          ? { settings, warning: "" }
          : { settings: { ...DEFAULT_SLEEP_SETTINGS }, warning: "不正な睡眠時間の保存データを初期設定へ戻しました。" };
      } catch (error) {
        throw new Error("睡眠時間の端末内設定を読み込めません。Safariの設定をご確認ください。", { cause: error });
      }
    },

    save(settings) {
      const safeSettings = normalizeSleepSettings(settings);
      if (!safeSettings) throw new Error(validateSleepSettings(settings).message);
      try {
        storage.setItem(SLEEP_STORAGE_KEY, JSON.stringify(safeSettings));
      } catch (error) {
        throw new Error("睡眠時間を端末内に保存できませんでした。Safariの設定をご確認ください。", { cause: error });
      }
      return safeSettings;
    },
  };
}
