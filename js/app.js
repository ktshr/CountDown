import {
  formatJst,
  formatJstDateTimeLocal,
  getCountdown,
  getInputLimits,
  parseJstDateTimeLocal,
  validateTarget,
} from "./countdown.js";
import {
  canAddTimer,
  createTimerStorage,
  MAX_NAME_LENGTH,
  MAX_TIMERS,
} from "./storage.js";
import { createQrImageDataUrl, decodeQrImageFile } from "./qr-code.js";
import {
  createQrPayload,
  mergeImportedTimers,
  parseQrPayload,
  parseTimerJson,
  serializeTimers,
} from "./transfer.js";

const MAX_JSON_FILE_BYTES = 1024 * 1024;

const elements = {
  openButton: document.querySelector("#open-form-button"),
  dialog: document.querySelector("#timer-dialog"),
  form: document.querySelector("#timer-form"),
  closeButton: document.querySelector("#close-form-button"),
  cancelButton: document.querySelector("#cancel-button"),
  title: document.querySelector("#dialog-title"),
  id: document.querySelector("#timer-id"),
  name: document.querySelector("#timer-name"),
  target: document.querySelector("#target-at"),
  formError: document.querySelector("#form-error"),
  message: document.querySelector("#message"),
  countLabel: document.querySelector("#count-label"),
  limitMessage: document.querySelector("#limit-message"),
  empty: document.querySelector("#empty-state"),
  list: document.querySelector("#timer-list"),
  template: document.querySelector("#timer-template"),
  deleteDialog: document.querySelector("#delete-dialog"),
  deleteName: document.querySelector("#delete-name"),
  deleteCancel: document.querySelector("#delete-cancel"),
  deleteConfirm: document.querySelector("#delete-confirm"),
  openShareButton: document.querySelector("#open-share-button"),
  shareDialog: document.querySelector("#share-dialog"),
  closeShareButton: document.querySelector("#close-share-button"),
  shareDoneButton: document.querySelector("#share-done-button"),
  showShareQrButton: document.querySelector("#show-share-qr-button"),
  exportJsonButton: document.querySelector("#export-json-button"),
  qrImageInput: document.querySelector("#qr-image-input"),
  jsonFileInput: document.querySelector("#json-file-input"),
  shareQrOutput: document.querySelector("#share-qr-output"),
  shareQrImage: document.querySelector("#share-qr-image"),
  shareMessage: document.querySelector("#share-message"),
};

let timers = [];
let deleteCandidateId = null;
let repository = null;

function showMessage(text, kind = "info") {
  elements.message.textContent = text;
  elements.message.dataset.kind = kind;
  elements.message.hidden = !text;
}

function showFormError(text) {
  elements.formError.textContent = text;
  elements.formError.hidden = !text;
}

function showShareMessage(text, kind = "info") {
  elements.shareMessage.textContent = text;
  elements.shareMessage.dataset.kind = kind;
  elements.shareMessage.hidden = !text;
}

function clearShareQr() {
  elements.shareQrImage.removeAttribute("src");
  elements.shareQrOutput.hidden = true;
}

function getSortedTimers() {
  return [...timers].sort((a, b) => Date.parse(a.targetAt) - Date.parse(b.targetAt));
}

function createTimerCard(timer, nowMs) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const targetMs = Date.parse(timer.targetAt);
  const countdown = getCountdown(targetMs, nowMs);
  card.dataset.id = timer.id;
  card.classList.toggle("ended", countdown.ended);
  card.querySelector(".status-text").textContent = countdown.ended ? "終了済み" : "予定";
  card.querySelector(".timer-name").textContent = timer.name;
  card.querySelector(".remaining").textContent = countdown.label;
  const time = card.querySelector(".target-time");
  time.textContent = formatJst(targetMs);
  time.dateTime = timer.targetAt;
  card.querySelector(".edit-button").setAttribute("aria-label", `${timer.name}を編集`);
  card.querySelector(".delete-button").setAttribute("aria-label", `${timer.name}を削除`);
  return card;
}

function render() {
  const nowMs = Date.now();
  const cards = document.createDocumentFragment();
  for (const timer of getSortedTimers()) cards.append(createTimerCard(timer, nowMs));
  elements.list.replaceChildren(cards);

  const atLimit = !canAddTimer(timers);
  elements.countLabel.textContent = `${timers.length} / ${MAX_TIMERS}件`;
  elements.empty.hidden = timers.length !== 0;
  elements.openButton.disabled = atLimit;
  elements.limitMessage.hidden = !atLimit;
  const hasTimers = timers.length > 0;
  elements.showShareQrButton.disabled = !hasTimers;
  elements.exportJsonButton.disabled = !hasTimers;
}

function openForm(timer = null) {
  if (!timer && !canAddTimer(timers)) {
    showMessage("登録できるタイマーは最大10件です。", "warning");
    return;
  }
  const limits = getInputLimits();
  elements.form.reset();
  elements.id.value = timer?.id ?? "";
  elements.title.textContent = timer ? "タイマーを編集" : "タイマーを登録";
  elements.name.value = timer?.name ?? "";
  elements.target.value = timer ? formatJstDateTimeLocal(Date.parse(timer.targetAt)) : "";
  elements.target.min = limits.min;
  elements.target.max = limits.max;
  showFormError("");
  elements.dialog.showModal();
  elements.name.focus();
}

function closeForm() {
  elements.dialog.close();
}

function makeUniqueId() {
  let id;
  do {
    id = globalThis.crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } while (timers.some((timer) => timer.id === id));
  return id;
}

function saveForm(event) {
  event.preventDefault();
  showFormError("");
  const id = elements.id.value;
  const name = elements.name.value.trim();
  if (!name) {
    showFormError("⚠ 名称を入力してください。空白だけでは登録できません。");
    elements.name.focus();
    return;
  }
  if (name.length > MAX_NAME_LENGTH) {
    showFormError(`⚠ 名称は${MAX_NAME_LENGTH}文字以内で入力してください。`);
    elements.name.focus();
    return;
  }

  const targetMs = parseJstDateTimeLocal(elements.target.value);
  const validation = validateTarget(targetMs, Date.now());
  if (!validation.valid) {
    showFormError(`⚠ ${validation.message}`);
    elements.target.focus();
    return;
  }

  const existing = timers.find((timer) => timer.id === id);
  if (!existing && !canAddTimer(timers)) {
    showFormError("⚠ 登録できるタイマーは最大10件です。");
    return;
  }

  const nowIso = new Date().toISOString();
  const next = existing
    ? timers.map((timer) => timer.id === id ? { ...timer, name, targetAt: new Date(targetMs).toISOString(), updatedAt: nowIso } : timer)
    : [...timers, { id: makeUniqueId(), name, targetAt: new Date(targetMs).toISOString(), createdAt: nowIso, updatedAt: nowIso }];
  try {
    timers = repository.save(next);
    closeForm();
    showMessage(existing ? "タイマーを更新しました。" : "タイマーを登録しました。", "success");
    render();
  } catch (error) {
    showFormError(`⚠ ${error.message}`);
  }
}

function handleListClick(event) {
  if (!(event.target instanceof Element)) return;
  const card = event.target.closest(".timer-card");
  if (!card) return;
  const timer = timers.find((item) => item.id === card.dataset.id);
  if (!timer) return;
  if (event.target.closest(".edit-button")) openForm(timer);
  if (event.target.closest(".delete-button")) {
    deleteCandidateId = timer.id;
    elements.deleteName.textContent = timer.name;
    elements.deleteDialog.showModal();
    elements.deleteCancel.focus();
  }
}

function confirmDelete() {
  if (!deleteCandidateId) return;
  const next = timers.filter((timer) => timer.id !== deleteCandidateId);
  try {
    timers = repository.save(next);
    deleteCandidateId = null;
    elements.deleteDialog.close();
    showMessage("タイマーを削除しました。", "success");
    render();
  } catch (error) {
    elements.deleteDialog.close();
    showMessage(`⚠ ${error.message}`, "error");
  }
}

function openShareDialog() {
  clearShareQr();
  showShareMessage("");
  elements.shareDialog.showModal();
  elements.closeShareButton.focus();
}

function closeShareDialog() {
  elements.shareDialog.close();
}

function showShareQr() {
  try {
    const payload = createQrPayload(timers);
    elements.shareQrImage.src = createQrImageDataUrl(payload);
    elements.shareQrOutput.hidden = false;
    showShareMessage(`${timers.length}件のタイマーを共有するQRコードを作成しました。`, "success");
  } catch (error) {
    clearShareQr();
    const message = String(error?.message ?? error);
    const guidance = message.includes("overflow")
      ? "登録内容がQRコードの容量を超えています。JSONファイルをご利用ください。"
      : message;
    showShareMessage(`⚠ ${guidance}`, "error");
  }
}

function backupFileName(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `countdown-backup-${timestamp}.json`;
}

function downloadJsonFile(contents, fileName) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function exportJson() {
  try {
    const contents = serializeTimers(timers);
    const fileName = backupFileName();
    const file = new File([contents], fileName, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "カウントダウンのバックアップ",
      });
    } else {
      downloadJsonFile(contents, fileName);
    }
    showShareMessage(`${timers.length}件のJSONバックアップを書き出しました。`, "success");
  } catch (error) {
    if (error.name === "AbortError") {
      showShareMessage("JSONの共有をキャンセルしました。", "info");
      return;
    }
    showShareMessage(`⚠ ${error.message}`, "error");
  }
}

function importTimers(importedTimers, sourceLabel) {
  const result = mergeImportedTimers(timers, importedTimers);
  const changeCount = result.added + result.updated;
  if (changeCount === 0) {
    const reason = result.omitted > 0
      ? `登録上限のため${result.omitted}件を追加できません。`
      : "取り込む必要がある新しい内容はありません。";
    showShareMessage(reason, "warning");
    return;
  }

  const details = [
    `追加${result.added}件`,
    `更新${result.updated}件`,
    `変更なし${result.unchanged}件`,
    `上限により除外${result.omitted}件`,
  ].join("、");
  if (!window.confirm(`${sourceLabel}からタイマーを取り込みますか？\n${details}`)) {
    showShareMessage("読み込みをキャンセルしました。", "info");
    return;
  }

  try {
    timers = repository.save(result.timers);
    clearShareQr();
    render();
    showShareMessage(`タイマーを取り込みました（${details}）。`, "success");
    showMessage("共有データを取り込みました。", "success");
  } catch (error) {
    showShareMessage(`⚠ ${error.message}`, "error");
  }
}

async function handleQrImage(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  showShareMessage("QRコード画像を解析しています…", "info");
  try {
    const payload = await decodeQrImageFile(file);
    importTimers(parseQrPayload(payload), "QRコード");
  } catch (error) {
    showShareMessage(`⚠ ${error.message}`, "error");
  }
}

async function handleJsonFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > MAX_JSON_FILE_BYTES) {
    showShareMessage("⚠ JSONファイルは1MB以下にしてください。", "error");
    return;
  }
  try {
    importTimers(parseTimerJson(await file.text()), "JSONファイル");
  } catch (error) {
    showShareMessage(`⚠ ${error.message}`, "error");
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      showMessage("⚠ オフライン機能を準備できませんでした。通信環境を確認して再読み込みしてください。", "error");
    });
  });
}

function init() {
  try {
    repository = createTimerStorage(window.localStorage);
    const result = repository.load();
    timers = result.timers;
    showMessage(result.warning, "warning");
  } catch (error) {
    // メモリ上では閲覧できる状態を維持し、保存時には同じ説明を返す。
    showMessage(`⚠ ${error.message}`, "error");
    repository = { save() { throw error; } };
  }
  render();
  elements.openButton.addEventListener("click", () => openForm());
  elements.openShareButton.addEventListener("click", openShareDialog);
  elements.closeButton.addEventListener("click", closeForm);
  elements.cancelButton.addEventListener("click", closeForm);
  elements.form.addEventListener("submit", saveForm);
  elements.list.addEventListener("click", handleListClick);
  elements.deleteCancel.addEventListener("click", () => elements.deleteDialog.close());
  elements.deleteConfirm.addEventListener("click", confirmDelete);
  elements.closeShareButton.addEventListener("click", closeShareDialog);
  elements.shareDoneButton.addEventListener("click", closeShareDialog);
  elements.showShareQrButton.addEventListener("click", showShareQr);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.qrImageInput.addEventListener("change", handleQrImage);
  elements.jsonFileInput.addEventListener("change", handleJsonFile);
  elements.shareDialog.addEventListener("close", () => {
    clearShareQr();
    showShareMessage("");
  });
  elements.deleteDialog.addEventListener("close", () => {
    deleteCandidateId = null;
    elements.deleteName.textContent = "";
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  window.addEventListener("pageshow", render);
  window.setInterval(render, 60_000);
  registerServiceWorker();
}

init();
