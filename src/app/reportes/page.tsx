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
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchWithCache, getCached } from "@/lib/client-cache";

type SupplierOption = { id: string; name: string };

interface ReportCardConfig {
  title: string;
  description: string;
  group: "oficiales" | "bitacoras";
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  xlsxHref: string;
  pdfHref: string;
}

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

  const reports: ReportCardConfig[] = [
    {
      title: "Planilla Corta Fechas (Formato Oficial)",
      description:
        "Diseño oficial imprimible con logo Distrimarcas S.A.S., FECHA, PROVEEDOR y las 6 columnas oficiales: CÓDIGO, PRODUCTO, CAJAS, UNID., LOTE y FECHA VENCIMIENTO.",
      group: "oficiales",
      icon: FileCheck2,
      accent:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
      xlsxHref: `/api/reports/export?type=corta_fecha&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=corta_fecha&format=pdf${providerQuery}`,
    },
    {
      title: `Productos Próximos a Vencer (≤ ${days} días)`,
      description:
        "Planilla oficial filtrada con los lotes vencidos y próximos a vencer dentro de la ventana seleccionada, lista para gestión comercial o despacho FEFO.",
      group: "oficiales",
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
      group: "oficiales",
      icon: ShieldAlert,
      accent:
        "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70",
      xlsxHref: `/api/reports/export?type=damaged&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=damaged&format=pdf${providerQuery}`,
    },
    {
      title: "Reporte General Multi-Hoja",
      description:
        "Libro completo en Excel con Planilla Corta Fecha, Inventario Detallado por Empaque, Productos Averiados y Bitácora de Inspecciones (y resumen PDF).",
      group: "oficiales",
      icon: Layers,
      accent:
        "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70",
      xlsxHref: `/api/reports/export?type=general&format=xlsx${providerQuery}`,
      pdfHref: `/api/reports/export?type=general&format=pdf${providerQuery}`,
    },
    {
      title: "Bitácora de Inspecciones",
      description:
        "Historial de recorridos e inspecciones físicas en Bodega Distrimarcas, verificaciones de fechas de vencimiento, hallazgos y acciones correctivas.",
      group: "bitacoras",
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
      group: "bitacoras",
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

  const renderGroup = (
    groupKey: ReportCardConfig["group"],
    heading: string,
    subheading: string
  ) => {
    const items = reports.filter((r) => r.group === groupKey);
    return (
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            {heading}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {subheading}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((rep) => {
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
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        XLSX
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        PDF
                      </span>
                    </div>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
                    {rep.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {rep.description}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <a
                    href={rep.xlsxHref}
                    onClick={() => handleDownloadClick(rep.title, "Excel")}
                    className="ui-btn ui-btn-secondary py-2 text-xs"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Excel (.xlsx)
                  </a>
                  <a
                    href={rep.pdfHref}
                    onClick={() => handleDownloadClick(rep.title, "PDF")}
                    className="ui-btn ui-btn-secondary py-2 text-xs"
                  >
                    <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    PDF (.pdf)
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de Reportes"
        badge={warehouseName}
        description="Generación organizada de planillas oficiales Distrimarcas S.A.S. en Excel (.xlsx) y PDF (.pdf)."
        primaryAction={
          <a
            href={`/api/reports/export?type=general&format=xlsx${providerQuery}`}
            onClick={() =>
              handleDownloadClick("Reporte General Multi-Hoja", "Excel")
            }
            className="ui-btn ui-btn-primary"
          >
            <Download className="h-4 w-4" />
            Descargar General (.xlsx)
          </a>
        }
      />

      {/* Parámetros globales de exportación */}
      <div className="ui-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:items-end sm:p-5">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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

      {renderGroup(
        "oficiales",
        "Planillas Oficiales Distrimarcas S.A.S.",
        "Formatos estandarizados con encabezado corporativo para control de bodega e impresión."
      )}

      {renderGroup(
        "bitacoras",
        "Bitácoras y Trazabilidad",
        "Registros de inspecciones físicas y auditoría completa del sistema."
      )}
    </div>
  );
}
