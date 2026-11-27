/**
 * Client-side compressed photographic evidence store keyed by record ID.
 * Keeps PostgreSQL/Prisma schema unchanged while giving instant camera/file
 * evidence attachment and preview in Inspections and Damaged Records.
 */

export interface EvidencePhoto {
  id: string;
  name: string;
  dataUrl: string;
  addedAt: string;
}

const STORAGE_PREFIX = "cf:evidence:v1:";

export function loadEvidencePhotos(scope: string): EvidencePhoto[] {
  if (typeof window === "undefined" || !scope) return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEvidencePhotos(scope: string, photos: EvidencePhoto[]): void {
  if (typeof window === "undefined" || !scope) return;
  try {
    if (photos.length === 0) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${scope}`);
    } else {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${scope}`,
        JSON.stringify(photos.slice(0, 4))
      );
    }
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export async function compressImageFile(file: File): Promise<EvidencePhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("Imagen inválida"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    dataUrl,
    addedAt: new Date().toISOString(),
  };
}
