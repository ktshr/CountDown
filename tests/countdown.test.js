import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  addJstCalendarYears,
  formatJst,
  getCountdown,
  getJstParts,
  parseJstDateTimeLocal,
  validateTarget,
} from "../js/countdown.js";
import { canAddTimer, createTimerStorage, MAX_TIMERS, sanitizeTimers } from "../js/storage.js";

const MINUTE = 60_000;
const HOUR = 3_600_000;

test("2時間29分は残り2時間になる", () => {
  assert.equal(getCountdown(2 * HOUR + 29 * MINUTE, 0).label, "残り2時間");
});

test("2時間30分は残り3時間になる", () => {
  assert.equal(getCountdown(2 * HOUR + 30 * MINUTE, 0).label, "残り3時間");
});

test("30分は残り1時間になる", () => {
  assert.equal(getCountdown(30 * MINUTE, 0).label, "残り1時間");
});

test("29分は残り0時間になる", () => {
  assert.equal(getCountdown(29 * MINUTE, 0).label, "残り0時間");
});

test("到達時と過去日時は終了になる", () => {
  assert.deepEqual(getCountdown(1000, 1000), { ended: true, hours: 0, label: "終了" });
  assert.equal(getCountdown(999, 1000).label, "終了");
});

test("過去日時は登録できない", () => {
  assert.equal(validateTarget(999, 1000).valid, false);
});

test("99年後ちょうどは登録でき、超過は登録できない", () => {
  const now = parseJstDateTimeLocal("2026-09-01T12:00");
  const upper = addJstCalendarYears(now, 99);
  assert.equal(validateTarget(upper, now).valid, true);
  assert.equal(validateTarget(upper + 1, now).valid, false);
});

test("うるう日から99年後は対象年の2月末になる", () => {
  const leapDay = parseJstDateTimeLocal("2024-02-29T08:15");
  assert.deepEqual(getJstParts(addJstCalendarYears(leapDay, 99)), {
    year: 2123, month: 2, day: 28, hour: 8, minute: 15, second: 0, millisecond: 0,
  });
});

test("最大20件まで登録でき、21件目は追加できない", () => {
  assert.equal(MAX_TIMERS, 20);
  assert.equal(canAddTimer(Array.from({ length: 19 })), true);
  assert.equal(canAddTimer(Array.from({ length: 20 })), false);
});

function validTimer(id) {
  return {
    id,
    name: `予定${id}`,
    targetAt: "2030-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("不正・重複・21件目の保存データを安全に除外する", () => {
  const source = [null, { id: "bad" }, validTimer("a"), validTimer("a")];
  for (let index = 0; index < 22; index += 1) source.push(validTimer(`id-${index}`));
  const result = sanitizeTimers(source);
  assert.equal(result.length, 20);
  assert.equal(new Set(result.map((item) => item.id)).size, 20);
});

test("保存データの名称長とISO日時形式を厳格に検証する", () => {
  assert.deepEqual(sanitizeTimers([{ ...validTimer("long"), name: "長".repeat(81) }]), []);
  assert.deepEqual(sanitizeTimers([{ ...validTimer("date"), targetAt: "2030-01-01" }]), []);
});

test("保存処理でも21件目を拒否する", () => {
  const repository = createTimerStorage({ setItem() {} });
  const twentyOne = Array.from({ length: 21 }, (_, index) => validTimer(`id-${index}`));
  assert.throws(() => repository.save(twentyOne), /保存内容を検証できません/);
});

test("JSON解析エラーと配列でないデータから安全に起動する", () => {
  const broken = createTimerStorage({ getItem: () => "{" });
  assert.deepEqual(broken.load().timers, []);
  const notArray = createTimerStorage({ getItem: () => "{}" });
  assert.deepEqual(notArray.load().timers, []);
});

test("保存時の容量エラーを日本語のエラーとして通知する", () => {
  const repository = createTimerStorage({ setItem() { throw new Error("quota"); } });
  assert.throws(() => repository.save([validTimer("a")]), /端末内に保存できません/);
});

test("datetime-localをAsia/Tokyoとして解釈・表示する", () => {
  const epoch = parseJstDateTimeLocal("2026-01-02T03:04");
  assert.equal(epoch, Date.parse("2026-01-01T18:04:00.000Z"));
  assert.match(formatJst(epoch), /2026\/01\/02/);
  assert.match(formatJst(epoch), /03:04 JST/);
  assert.ok(Number.isNaN(parseJstDateTimeLocal("2026-02-30T03:04")));
});

test("端末タイムゾーンが異なってもJST解釈結果は変わらない", () => {
  const moduleUrl = new URL("../js/countdown.js", import.meta.url).href;
  const script = `import('${moduleUrl}').then(m => process.stdout.write(String(m.parseJstDateTimeLocal('2026-07-08T09:10'))))`;
  const run = (tz) => execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    env: { ...process.env, TZ: tz }, encoding: "utf8",
  });
  assert.equal(run("America/Los_Angeles"), run("Europe/London"));
});
