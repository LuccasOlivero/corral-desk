import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";

/**
 * Redimensiona y comprime imágenes rasterizadas grandes a WebP antes de enviarlas
 * por IPC a Rust y guardarlas en disco, reduciendo el peso en disco y RAM hasta un 90%.
 */
export async function optimizeAndSaveImage(file: File, maxDimension = 1600): Promise<string> {
  const rawExt = (file.type.split("/")[1] || "png")
    .replace("jpeg", "jpg")
    .replace("svg+xml", "svg");

  // No recomprimir SVGs vectoriales ni GIFs animados
  if (rawExt === "svg" || rawExt === "gif") {
    const buf = new Uint8Array(await file.arrayBuffer());
    const path = await api.saveImage(buf, rawExt);
    return convertFileSrc(path);
  }

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const needsResize = width > maxDimension || height > maxDimension;

    if (needsResize) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    // Si es pequeña (< 80 KB), ya es WebP y no requiere redimensionar, evitar recodificar
    if (!needsResize && rawExt === "webp" && file.size < 80 * 1024) {
      bitmap.close();
      const buf = new Uint8Array(await file.arrayBuffer());
      const path = await api.saveImage(buf, "webp");
      return convertFileSrc(path);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      );
      if (blob && (needsResize || blob.size < file.size)) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const path = await api.saveImage(buf, "webp");
        return convertFileSrc(path);
      }
    } else {
      bitmap.close();
    }
  } catch {
    // Fallback al archivo original si el navegador no soporta createImageBitmap para el formato
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const path = await api.saveImage(buf, rawExt);
  return convertFileSrc(path);
}
