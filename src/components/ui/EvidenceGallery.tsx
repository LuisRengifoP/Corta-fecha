"use client";

import { useRef, useState } from "react";
import { Camera, Eye, ImagePlus, Trash2, X } from "lucide-react";
import { compressImageFile, EvidencePhoto } from "@/lib/evidence-store";

interface EvidenceGalleryProps {
  photos: EvidencePhoto[];
  onChange?: (next: EvidencePhoto[]) => void;
  readOnly?: boolean;
  maxPhotos?: number;
}

export function EvidenceGallery({
  photos,
  onChange,
  readOnly = false,
  maxPhotos = 4,
}: EvidenceGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<EvidencePhoto | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !onChange) return;
    setBusy(true);
    try {
      const remaining = Math.max(0, maxPhotos - photos.length);
      const selected = Array.from(fileList).slice(0, remaining);
      const processed: EvidencePhoto[] = [];
      for (const file of selected) {
        if (!file.type.startsWith("image/")) continue;
        processed.push(await compressImageFile(file));
      }
      if (processed.length > 0) {
        onChange([...photos, ...processed]);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2.5">
      {!readOnly && onChange && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || photos.length >= maxPhotos}
              onClick={() => inputRef.current?.click()}
              className="ui-btn ui-btn-secondary py-1.5 text-xs"
            >
              <ImagePlus className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              {busy ? "Procesando..." : "Adjuntar foto"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
          <span className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
            {photos.length}/{maxPhotos} evidencias
          </span>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          <Camera className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            {readOnly
              ? "Sin evidencias fotográficas adjuntas en este dispositivo."
              : "Opcional: toma o adjunta fotos del estado físico, empaque o etiqueta."}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.dataUrl}
                alt={photo.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-900/55 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setPreviewUrl(photo)}
                  aria-label="Ver evidencia"
                  className="rounded-lg bg-white/90 p-1.5 text-slate-900 hover:bg-white"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                {!readOnly && onChange && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(photos.filter((p) => p.id !== photo.id))
                    }
                    aria-label="Quitar evidencia"
                    className="rounded-lg bg-red-600/90 p-1.5 text-white hover:bg-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewUrl && (
        <div
          className="cf-animate-fade fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-h-[88vh] max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-200">
              <span className="truncate font-medium">{previewUrl.name}</span>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                aria-label="Cerrar vista previa"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl.dataUrl}
              alt={previewUrl.name}
              className="max-h-[78vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
