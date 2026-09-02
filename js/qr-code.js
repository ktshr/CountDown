const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DECODE_DIMENSION = 1800;
const QR_QUIET_ZONE_MODULES = 4;

function getQrGenerator() {
  const generator = globalThis.qrcode;
  if (typeof generator !== "function") throw new Error("QRコード生成機能を読み込めませんでした。");
  generator.stringToBytes = generator.stringToBytesFuncs["UTF-8"];
  return generator;
}

// QRの1モジュールを整数ピクセルで描き、画面撮影時にも輪郭がぼやけないようにする。
export function createQrImageDataUrl(payload) {
  const generator = getQrGenerator();
  const qr = generator(0, "L");
  qr.addData(payload, "Byte");
  qr.make();

  const moduleCount = qr.getModuleCount();
  const scale = Math.max(2, Math.floor(420 / (moduleCount + QR_QUIET_ZONE_MODULES * 2)));
  const size = (moduleCount + QR_QUIET_ZONE_MODULES * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QRコードを描画できませんでした。");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000000";
  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!qr.isDark(row, column)) continue;
      context.fillRect(
        (column + QR_QUIET_ZONE_MODULES) * scale,
        (row + QR_QUIET_ZONE_MODULES) * scale,
        scale,
        scale,
      );
    }
  }
  return canvas.toDataURL("image/png");
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("選択した画像を読み込めませんでした。"));
    };
    image.src = objectUrl;
  });
}

// videoと画像の両方を同じ経路で解析し、カメラ走査中はcanvasを再利用できるようにする。
export function decodeQrImageSource(source, sourceWidth, sourceHeight, canvas, maxDimension = MAX_DECODE_DIMENSION) {
  const decoder = globalThis.jsQR;
  if (typeof decoder !== "function") throw new Error("QRコード読取機能を読み込めませんでした。");
  if (!sourceWidth || !sourceHeight) return null;

  const ratio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * ratio));
  const height = Math.max(1, Math.round(sourceHeight * ratio));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("QRコード画像を解析できませんでした。");
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  return decoder(pixels.data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

export async function decodeQrImageFile(file) {
  if (!(file instanceof Blob)) throw new Error("QRコード画像を選択してください。");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("QRコード画像は20MB以下にしてください。");
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const payload = decodeQrImageSource(image, image.naturalWidth, image.naturalHeight, canvas);
  if (!payload) throw new Error("画像から共有QRコードを見つけられませんでした。");
  return payload;
}
