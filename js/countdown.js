// アプリ内で扱う日時は、端末設定に関係なく日本標準時に固定する。
export const TIME_ZONE = "Asia/Tokyo";
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// datetime-local の各要素をJSTとして解釈し、曖昧さのないUTCミリ秒へ変換する。
export function parseJstDateTimeLocal(value) {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return Number.NaN;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return Number.NaN;

  const utcMs = Date.UTC(year, month - 1, day, hour - 9, minute);
  const verified = getJstParts(utcMs);
  const isSame = verified.year === year && verified.month === month && verified.day === day
    && verified.hour === hour && verified.minute === minute;
  return isSame ? utcMs : Number.NaN;
}

// UTCミリ秒からJSTの暦要素を得る。UTC用getterを使うことで端末TZの影響を除く。
export function getJstParts(epochMs) {
  const shifted = new Date(epochMs + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// JSTの同月同時刻へ99暦年を加える。2月29日は存在する最後の日（2月28日）へ丸める。
export function addJstCalendarYears(epochMs, years) {
  const parts = getJstParts(epochMs);
  const targetYear = parts.year + years;
  const targetDay = Math.min(parts.day, daysInMonth(targetYear, parts.month));
  return Date.UTC(
    targetYear,
    parts.month - 1,
    targetDay,
    parts.hour - 9,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

// 保存時点の現在日時を基準に、未来かつ99暦年以内であることを再検証する。
export function validateTarget(targetMs, nowMs = Date.now()) {
  if (!Number.isFinite(targetMs)) return { valid: false, message: "正しい目標日時を入力してください。" };
  if (targetMs <= nowMs) return { valid: false, message: "目標日時は現在より後にしてください。" };
  if (targetMs > addJstCalendarYears(nowMs, 99)) {
    return { valid: false, message: "目標日時は現在から99年後までにしてください。" };
  }
  return { valid: true, message: "" };
}

// Math.roundにより、30分以上を切り上げ、30分未満を切り捨てる。
export function getCountdown(targetMs, nowMs = Date.now()) {
  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) return { ended: true, hours: 0, label: "終了" };
  const hours = Math.round(remainingMs / HOUR_MS);
  return { ended: false, hours, label: `残り${hours}時間` };
}

const displayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatJst(epochMs) {
  return `${displayFormatter.format(new Date(epochMs))} JST`;
}

const pad = (value) => String(value).padStart(2, "0");

// 編集フォームへ戻す値もJSTの各要素から明示的に組み立てる。
export function formatJstDateTimeLocal(epochMs) {
  const p = getJstParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function getInputLimits(nowMs = Date.now()) {
  // datetime-localは分単位なので、現在より後となる次の分を最小値にする。
  const nextMinute = Math.floor(nowMs / 60000) * 60000 + 60000;
  return {
    min: formatJstDateTimeLocal(nextMinute),
    max: formatJstDateTimeLocal(addJstCalendarYears(nowMs, 99)),
  };
}
