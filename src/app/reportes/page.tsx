"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  ShieldAlert,
  Warehouse,
  X,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { useToast } from "@/components/ToastProvider";
import { fetchWithCache, getCached } from "@/lib/client-cache";

type SupplierOption = { id: string; name: string };

export default function ReportesPage() {
  const { notify } = useToast();
  const { warehouseName } = useAppSession();
  const [days, setDays] = useState("30");
  const [provider, setProvider] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(
    () => getCached<SupplierOption[]>("ref:suppliers") ?? []
  );

  useEffect(() => {
    fetchWithCache<SupplierOption[]>(
      "ref:suppliers",
      async () => {
        const res = await fetch("/api/suppliers");
        if (!res.ok) throw new Error("No se pudieron cargar proveedores");
        const data = await res.json();
        return data?.suppliers ?? [];
      },
      { ttlMs: 120_000 }
    )
      .then((list) => setSuppliers(list))
      .catch(() => {});
  }, []);

  const providerQuery = provider.trim()
    ? `&provider=${encodeURIComponent(provider.trim())}`
    : "";

  const reports = [
    {
      title: "Planilla Corta Fechas (Formato Oficial Distrimarcas S.A.S.)",
      description:
        "Diseño oficial de planilla imprimible con logo Distrimarcas S.A.S., FECHA, PROVEEDOR y las 6 columnas oficiales: CÓDIGO, PRODUCTO, CAJAS, UNID., LOTE y FECHA VENCIMIENTO.",
      icon: FileCheck2,
      accent:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
      xlsxHref: `/api/reports/export?type=corta_fecha&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=corta_fecha&format=pdf${providerQuery}`,
    },
    {
      title: `Productos Próximos a Vencer (≤ ${days} días)`,
      description:
        "Planilla oficial con los lotes vencidos y próximos a vencer dentro de la ventana seleccionada, lista para impresión o despacho.",
      icon: AlertTriangle,
      accent:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
      xlsxHref: `/api/reports/export?type=expiring&days=${days}&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=expiring&days=${days}&format=pdf${providerQuery}`,
    },
    {
      title: "Productos en Averías (Formato Oficial)",
      description:
        "Planilla oficial de productos averiados con logo Distrimarcas S.A.S. (CÓDIGO, PRODUCTO, CAJAS, UNID., LOTE y FECHA VENCIMIENTO).",
      icon: ShieldAlert,
      accent:
        "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70",
      xlsxHref: `/api/reports/export?type=damaged&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=damaged&format=pdf${providerQuery}`,
    },
    {
      title: "Reporte General Multi-Hoja",
      description:
        "Libro completo en Excel con Planilla Corta Fecha, Inventario Detallado por Empaque, Productos Averiados y Bitácora de Inspecciones (y resumen en PDF).",
      icon: Layers,
      accent:
        "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70",
      xlsxHref: `/api/reports/export?type=general&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=general&format=pdf${providerQuery}`,
    },
    {
      title: "Bitácora de Inspecciones",
      description:
        "Historial de recorridos e inspecciones en Bodega Distrimarcas, verificaciones de fechas de vencimiento, hallazgos y acciones correctivas.",
      icon: ClipboardCheck,
      accent:
        "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/70",
      xlsxHref: `/api/reports/export?type=inspections&format=xlsx`,
      pdfHref: `/api/reports/export?type=inspections&format=pdf`,
    },
    {
      title: "Historial de Auditoría del Sistema",
      description:
        "Log cronológico de eventos registrados en la plataforma para control interno y trazabilidad operativa.",
      icon: History,
      accent:
        "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      xlsxHref: `/api/reports/export?type=activity&format=xlsx`,
      pdfHref: `/api/reports/export?type=activity&format=pdf`,
    },
  ];

  const handleDownloadClick = (title: string, format: "Excel" | "PDF") => {
    notify({
      title: `Generando ${format}...`,
      description: title,
      variant: "info",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Centro de Reportes Exportables (Excel y PDF)
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Genera planillas oficiales de Distrimarcas S.A.S. en formato{" "}
          <strong>.xlsx</strong> y <strong>.pdf</strong> listas para impresión y
          gestión de bodega.
        </p>
      </div>

      {/* Parámetros */}
      <div className="ui-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:items-end sm:p-5">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Bodega Activa
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Warehouse className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span className="truncate">{warehouseName}</span>
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Proveedor en encabezado (opcional)
          </label>
          <div className="relative mt-1.5">
            <input
              type="text"
              list="reportes-suppliers-list"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Dejar vacío para línea en blanco"
              className="ui-input pr-8"
            />
            {provider && (
              <button
                type="button"
                onClick={() => setProvider("")}
                aria-label="Limpiar proveedor"
                className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <datalist id="reportes-suppliers-list">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Ventana de Vencimiento (próximos)
          </label>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="ui-select mt-1.5"
          >
            <option value="15">Próximos 15 días (Crítico)</option>
            <option value="30">Próximos 30 días (Estándar)</option>
            <option value="60">Próximos 60 días (Preventivo)</option>
            <option value="90">Próximos 90 días (Trimestral)</option>
          </select>
        </div>
      </div>

      {/* Tarjetas de descarga */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {reports.map((rep) => {
          const Icon = rep.icon;
          return (
            <div
              key={rep.title}
              className="ui-card-interactive flex flex-col justify-between p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${rep.accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      XLSX
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </span>
                  </div>
                </div>
                <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
                  {rep.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {rep.description}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <a
                  href={rep.xlsxHref}
                  onClick={() => handleDownloadClick(rep.title, "Excel")}
                  className="ui-btn ui-btn-emerald py-2.5"
                >
                  <Download className="h-4 w-4" />
                  Excel (.xlsx)
                </a>
                <a
                  href={rep.pdfHref}
                  onClick={() => handleDownloadClick(rep.title, "PDF")}
                  className="ui-btn ui-btn-rose py-2.5"
                >
                  <FileText className="h-4 w-4" />
                  PDF (.pdf)
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
