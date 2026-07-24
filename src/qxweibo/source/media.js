export function responseContentType(response) {
  return String(response?.headers?.["content-type"] || response?.headers?.["Content-Type"] || "")
    .split(";")[0].trim().toLowerCase();
}

function bytesToBase64(bytes) {
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(output);
}

function dataUrl(bytes, type) {
  const base64 = bytesToBase64(bytes);
  return base64.length <= 1_900_000 ? `data:${type || "image/jpeg"};base64,${base64}` : "";
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.(),
    };
  }
  if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function") return null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Image decoding failed"));
      image.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function canvasBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Image conversion failed")),
      type,
      quality,
    );
  });
}

export async function safeImagePreview(bytes, type, kind) {
  const direct = dataUrl(bytes, type);
  if (direct && kind === "detail") return direct;
  let decoded;
  try {
    decoded = await decodeImage(new Blob([bytes], { type }));
    if (!decoded) return direct;
    const width = Math.max(1, Number(decoded.width) || 1);
    const height = Math.max(1, Number(decoded.height) || 1);
    const isLong = height / width >= 3.2;
    const maxEdge = kind === "thumbnail" ? 420 : (isLong ? 1_600 : 2_560);
    const maxPixels = kind === "thumbnail" ? 420 * 420 : 8_000_000;
    let scale = Math.min(
      1,
      maxEdge / Math.max(width, height),
      Math.sqrt(maxPixels / (width * height)),
    );
    let quality = kind === "thumbnail" ? 0.72 : 0.84;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(targetWidth, targetHeight)
        : Object.assign(document.createElement("canvas"), {
            width: targetWidth,
            height: targetHeight,
          });
      const drawing = canvas.getContext("2d");
      if (!drawing) throw new Error("Image canvas is unavailable");
      drawing.fillStyle = "#ffffff";
      drawing.fillRect(0, 0, targetWidth, targetHeight);
      drawing.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);
      const blob = await canvasBlob(canvas, "image/jpeg", quality);
      const preview = dataUrl(new Uint8Array(await blob.arrayBuffer()), "image/jpeg");
      if (preview) return preview;
      scale *= 0.72;
      quality = Math.max(0.56, quality - 0.07);
    }
  } catch {
    return direct;
  } finally {
    decoded?.close?.();
  }
  return direct;
}
