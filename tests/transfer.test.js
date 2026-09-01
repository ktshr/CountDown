import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  createQrPayload,
  mergeImportedTimers,
  parseQrPayload,
  parseTimerJson,
  serializeTimers,
} from "../js/transfer.js";

function timer(id, name = `予定${id}`, updatedAt = "2026-01-01T00:00:00.000Z") {
  return {
    id,
    name,
    targetAt: "2030-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

test("JSONバックアップを往復できる", () => {
  const timers = [timer("a", "日本語の予定")];
  assert.deepEqual(parseTimerJson(serializeTimers(timers, 0)), timers);
});

test("不正なJSON形式を拒否する", () => {
  assert.throws(() => parseTimerJson("{"), /解析できません/);
  assert.throws(() => parseTimerJson(JSON.stringify({ schema: "other", version: 1, timers: [] })), /対応している/);
});

test("QR共有データを日本語を含めて往復できる", () => {
  const timers = [timer("a", "旅行の出発✈️")];
  assert.deepEqual(parseQrPayload(createQrPayload(timers)), timers);
  assert.throws(() => parseQrPayload("https://example.com/"), /共有QRコードではありません/);
  assert.throws(() => parseQrPayload("CDT1:[[\"a\",\"予定\",1e100,0,0]]"), /不正なタイマー/);
});

test("取込時は新規追加し、同じIDでは新しい更新日時を採用する", () => {
  const current = [timer("same", "古い名称"), timer("keep")];
  const imported = [
    timer("same", "新しい名称", "2026-02-01T00:00:00.000Z"),
    timer("new"),
  ];
  const result = mergeImportedTimers(current, imported);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.timers.find((item) => item.id === "same").name, "新しい名称");
});

test("取込後も最大10件を超えない", () => {
  const current = Array.from({ length: 10 }, (_, index) => timer(`current-${index}`));
  const result = mergeImportedTimers(current, [timer("new")]);
  assert.equal(result.timers.length, 10);
  assert.equal(result.omitted, 1);
});

test("同梱ライブラリで生成したQRを同梱ライブラリで読み取れる", () => {
  const context = { Uint8ClampedArray };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../vendor/qrcode-generator-1.4.4.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../vendor/jsQR-8e6a036.js", import.meta.url), "utf8"), context);
  context.qrcode.stringToBytes = context.qrcode.stringToBytesFuncs["UTF-8"];

  const payload = createQrPayload([timer("a", "日本語の予定")]);
  const qr = context.qrcode(0, "L");
  qr.addData(payload, "Byte");
  qr.make();
  const quietZone = 4;
  const scale = 5;
  const modules = qr.getModuleCount();
  const size = (modules + quietZone * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  pixels.fill(255);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!qr.isDark(row, column)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixel = (((row + quietZone) * scale + y) * size
            + (column + quietZone) * scale + x) * 4;
          pixels[pixel] = 0;
          pixels[pixel + 1] = 0;
          pixels[pixel + 2] = 0;
        }
      }
    }
  }
  assert.equal(context.jsQR(pixels, size, size)?.data, payload);
});
