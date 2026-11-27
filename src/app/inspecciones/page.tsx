"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Plus,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import { InspectionStatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { EntityTimeline } from "@/components/ui/EntityTimeline";
import { EvidenceGallery } from "@/components/ui/EvidenceGallery";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { FormSection } from "@/components/ui/FormSection";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ComboboxOption,
  SearchableCombobox,
} from "@/components/ui/SearchableCombobox";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import { formatDateTimeES, INSPECTION_TYPE_LABELS } from "@/lib/constants";
import {
  EvidencePhoto,
  loadEvidencePhotos,
  saveEvidencePhotos,
} from "@/lib/evidence-store";

interface Warehouse {
  id: string;
  name: string;
}

interface LotOption {
  id: string;
  lotNumber: string;
  boxes: number;
  looseUnits: number;
  warehouseId: string;
  product: { name: string; sku: string };
  warehouse: { name: string };
}

interface InspectionItem {
  id: string;
  inspectorName: string;
  inspectionType: string;
  status: string;
  checkedBoxes: number;
  checkedUnits: number;
  expiryVerified: boolean;
  findings: string;
  correctiveAction: string | null;
  inspectedAt: string;
  warehouse: { name: string };
  lot: {
    id?: string;
    lotNumber: string;
    product: { name: string; sku: string };
  } | null;
}

export default function InspeccionesPage() {
  const { notify } = useToast();
  const { user, warehouseName, refreshAlertsCount } = useAppSession();
  const operatorName = user?.fullName || "Supervisor de Calidad";

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [inspections, setInspections] = useState<InspectionItem[]>(
    () => getCached<InspectionItem[]>("inspections:") ?? []
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>(
    () => getCached<Warehouse[]>("ref:warehouses") ?? []
  );
  const [lots, setLots] = useState<LotOption[]>(
    () => getCached<LotOption[]>("inventory:all") ?? []
  );
  const [loading, setLoading] = useState(() => !getCached("inspections:"));
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailInspection, setDetailInspection] =
    useState<InspectionItem | null>(null);
  const [detailPhotos, setDetailPhotos] = useState<EvidencePhoto[]>([]);
  const [draftPhotos, setDraftPhotos] = useState<EvidencePhoto[]>([]);
  const [deletingInspection, setDeletingInspection] =
    useState<InspectionItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const handledLotParamRef = useRef(false);

  const [form, setForm] = useState({
    warehouseId: warehouses[0]?.id ?? "",
    lotId: "",
    inspectorName: user?.fullName ?? "",
    inspectionType: "PROGRAMADA",
    status: "APROBADA",
    checkedBoxes: "0",
    checkedUnits: "0",
    expiryVerified: true,
    syncStockFromInspection: false,
    findings: "",
    correctiveAction: "",
  });

  const toNonNegInt = (val: string | number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };

  useEffect(() => {
    if (user?.fullName) {
      setForm((prev) => ({
        ...prev,
        inspectorName: prev.inspectorName || user.fullName,
      }));
    }
  }, [user?.fullName]);

  useEffect(() => {
    if (detailInspection) {
      setDetailPhotos(loadEvidencePhotos(`inspection:${detailInspection.id}`));
    } else {
      setDetailPhotos([]);
    }
  }, [detailInspection]);

  const loadData = useCallback(
    async (force = false) => {
      const cacheKey = `inspections:${statusFilter}`;
      if (!getCached(cacheKey)) {
        setLoading(true);
      }
      try {
        const q = new URLSearchParams();
        if (statusFilter) q.set("status", statusFilter);

        const [inspList, whList, lotsList] = await Promise.all([
          fetchWithCache<InspectionItem[]>(
            cacheKey,
            async () => {
              const res = await fetch(`/api/inspections?${q.toString()}`);
              if (!res.ok)
                throw new Error("No se pudieron cargar inspecciones");
              return (await res.json()).inspections ?? [];
            },
            { force, ttlMs: 15_000 }
          ),
          fetchWithCache<Warehouse[]>(
            "ref:warehouses",
            async () => {
              const res = await fetch("/api/warehouses");
              if (!res.ok) throw new Error("No se pudieron cargar bodegas");
              return (await res.json()).warehouses ?? [];
            },
            { force: false, ttlMs: 120_000 }
          ),
          fetchWithCache<LotOption[]>(
            "inventory:all",
            async () => {
              const res = await fetch("/api/inventory");
              if (!res.ok) throw new Error("No se pudieron cargar lotes");
              return (await res.json()).lots ?? [];
            },
            { force, ttlMs: 20_000 }
          ),
        ]);

        setInspections(inspList);
        setWarehouses(whList);
        setLots(lotsList);
        if (whList[0]?.id) {
          setForm((prev) => ({
            ...prev,
            warehouseId: prev.warehouseId || whList[0].id,
          }));
        }
      } catch {
        // Mantener datos previos en caso de error transitorio
      } finally {
        setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    if (handledLotParamRef.current || lots.length === 0) return;
    const lotIdParam = new URLSearchParams(window.location.search).get("lotId");
    if (lotIdParam) {
      handledLotParamRef.current = true;
      const target = lots.find((l) => l.id === lotIdParam);
      if (target) {
        setForm((prev) => ({
          ...prev,
          warehouseId: target.warehouseId,
          lotId: target.id,
          checkedBoxes: String(target.boxes),
          checkedUnits: String(target.looseUnits),
        }));
        setDraftPhotos([]);
        setShowModal(true);
      }
    }
  }, [lots]);

  const handleLotChange = (lotId: string) => {
    const target = lots.find((l) => l.id === lotId);
    setForm((prev) => ({
      ...prev,
      lotId,
      warehouseId: target ? target.warehouseId : prev.warehouseId,
      checkedBoxes: target ? String(target.boxes) : prev.checkedBoxes,
      checkedUnits: target ? String(target.looseUnits) : prev.checkedUnits,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const resolvedWarehouseId = form.warehouseId || warehouses[0]?.id || "";
    if (!form.inspectorName.trim()) {
      setErrorMsg("Ingresa el nombre del inspector responsable.");
      return;
    }
    if (!form.findings.trim()) {
      setErrorMsg("Describe los hallazgos de la inspección.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          warehouseId: resolvedWarehouseId,
          checkedBoxes: toNonNegInt(form.checkedBoxes),
          checkedUnits: toNonNegInt(form.checkedUnits),
          lotId: form.lotId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "No se pudo registrar la inspección";
        setErrorMsg(msg);
        notify({ title: "No se pudo guardar", description: msg, variant: "error" });
        return;
      }
      if (json.inspection?.id && draftPhotos.length > 0) {
        saveEvidencePhotos(`inspection:${json.inspection.id}`, draftPhotos);
      }
      const synced = form.syncStockFromInspection && Boolean(form.lotId);
      setShowModal(false);
      setDraftPhotos([]);
      setForm({
        warehouseId: warehouses[0]?.id ?? "",
        lotId: "",
        inspectorName: operatorName,
        inspectionType: "PROGRAMADA",
        status: "APROBADA",
        checkedBoxes: "0",
        checkedUnits: "0",
        expiryVerified: true,
        syncStockFromInspection: false,
        findings: "",
        correctiveAction: "",
      });
      notify({
        title: "Inspección registrada",
        description: synced
          ? "La inspección se guardó y el stock del lote fue sincronizado."
          : "La verificación física quedó guardada en la bitácora.",
        variant: "success",
      });
      invalidateCache("inspections:");
      invalidateCache("inventory:");
      invalidateCache("dashboard:");
      invalidateCache("alerts:");
      await Promise.all([loadData(true), refreshAlertsCount()]);
    } catch {
      const msg = "Error de conexión al guardar la inspección.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingInspection) return;
    setDeletingBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/inspections/${deletingInspection.id}?actor=${encodeURIComponent(
          operatorName
        )}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "No se pudo eliminar la inspección";
        setErrorMsg(msg);
        notify({ title: "Error al eliminar", description: msg, variant: "error" });
      } else {
        saveEvidencePhotos(`inspection:${deletingInspection.id}`, []);
        if (detailInspection?.id === deletingInspection.id) {
          setDetailInspection(null);
        }
        setDeletingInspection(null);
        notify({
          title: "Inspección eliminada",
          variant: "info",
        });
        invalidateCache("inspections:");
        invalidateCache("dashboard:");
        await loadData(true);
      }
    } catch {
      const msg = "Error de conexión al eliminar la inspección.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setDeletingBusy(false);
    }
  };

  const visibleInspections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inspections;
    return inspections.filter((i) =>
      `${i.inspectorName} ${i.findings} ${i.correctiveAction ?? ""} ${
        i.lot?.lotNumber ?? ""
      } ${i.lot?.product.sku ?? ""} ${i.lot?.product.name ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [inspections, search]);

  const kpis = useMemo(() => {
    let alertsCount = 0;
    let verifiedCount = 0;
    for (const i of visibleInspections) {
      if (i.status === "OBSERVACION" || i.status === "CRITICA") alertsCount++;
      if (i.expiryVerified) verifiedCount++;
    }
    return {
      total: visibleInspections.length,
      alertsCount,
      verifiedCount,
    };
  }, [visibleInspections]);

  const lotComboOptions: ComboboxOption[] = useMemo(
    () =>
      lots.map((l) => ({
        value: l.id,
        badge: l.product.sku,
        label: `${l.lotNumber} — ${l.product.name}`,
        sublabel: `${l.warehouse.name} · ${l.boxes} CJ / ${l.looseUnits} UN`,
        searchText: `${l.lotNumber} ${l.product.sku} ${l.product.name}`,
      })),
    [lots]
  );

  const pagedInspections = paginateItems(visibleInspections, page, pageSize);
  const hasActiveFilters = Boolean(search || statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control de Inspecciones"
        badge={warehouseName}
        description="Bitácora de verificaciones físicas, validación de fechas de vencimiento, evidencias y ajuste de conteo por lote."
        exports={[
          {
            label: "Excel",
            href: "/api/reports/export?type=inspections",
            format: "xlsx",
          },
          {
            label: "PDF",
            href: "/api/reports/export?type=inspections&format=pdf",
            format: "pdf",
          },
        ]}
        primaryAction={
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setDraftPhotos([]);
              setForm((prev) => ({
                ...prev,
                warehouseId: prev.warehouseId || warehouses[0]?.id || "",
                inspectorName: prev.inspectorName || operatorName,
              }));
              setShowModal(true);
            }}
            className="ui-btn ui-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Nueva Inspección
          </button>
        }
      />

      {/* KPIs consistentes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard
          label="Inspecciones"
          value={kpis.total}
          sublabel="Registros en bitácora"
          icon={<ClipboardCheck className="h-4 w-4" />}
          tone="indigo"
        />
        <KpiCard
          label="Con Hallazgos"
          value={kpis.alertsCount}
          sublabel="Observación o estado crítico"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="amber"
        />
        <KpiCard
          label="Fechas Verificadas"
          value={kpis.verifiedCount}
          sublabel="Etiqueta física confirmada"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Filtros */}
      <FilterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Buscar por inspector, producto, SKU, lote o hallazgo..."
        resultCount={visibleInspections.length}
        resultLabel="inspección(es)"
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          setSearch("");
          setStatusFilter("");
          setPage(1);
        }}
        tabs={
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "", label: "Todas" },
              { id: "APROBADA", label: "Aprobadas" },
              { id: "OBSERVACION", label: "Con observación" },
              { id: "CRITICA", label: "Críticas" },
            ].map((t) => (
              <button
                key={t.id || "all"}
                type="button"
                onClick={() => {
                  setStatusFilter(t.id);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === t.id
                    ? "bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Vista móvil en tarjetas */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando inspecciones...
          </div>
        ) : visibleInspections.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="Sin inspecciones registradas"
              description="Registra la primera verificación física en bodega."
            />
          </div>
        ) : (
          pagedInspections.items.map((insp) => (
            <div key={insp.id} className="ui-card space-y-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetailInspection(insp)}
                  className="min-w-0 text-left"
                >
                  <p className="tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateTimeES(insp.inspectedAt)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {INSPECTION_TYPE_LABELS[insp.inspectionType] ??
                      insp.inspectionType}{" "}
                    · {insp.inspectorName}
                  </p>
                </button>
                <InspectionStatusBadge status={insp.status} />
              </div>

              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {insp.lot
                  ? `${insp.lot.product.name} (${insp.lot.lotNumber})`
                  : "Inspección general de área"}
              </p>

              <div className="rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {insp.checkedBoxes} cajas · {insp.checkedUnits} u. sueltas ·
                  Vencimiento:{" "}
                  {insp.expiryVerified ? "Verificado ✓" : "Sin verificar"}
                </p>
                <p className="mt-1 text-slate-700 dark:text-slate-300">
                  {insp.findings}
                </p>
                {insp.correctiveAction && (
                  <p className="mt-1 font-medium text-indigo-700 dark:text-indigo-400">
                    Acción: {insp.correctiveAction}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setDetailInspection(insp)}
                  className="ui-btn ui-btn-secondary py-1.5 text-xs"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Detalle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setDeletingInspection(insp);
                  }}
                  className="ui-btn ui-btn-ghost border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabla escritorio */}
      <div className="ui-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Fecha y Tipo</th>
                <th className="px-4 py-3">Bodega / Lote</th>
                <th className="px-4 py-3">Inspector</th>
                <th className="px-4 py-3">Conteo Verificado</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Hallazgos</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    Cargando inspecciones...
                  </td>
                </tr>
              ) : visibleInspections.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<ClipboardCheck className="h-6 w-6" />}
                      title="Sin inspecciones registradas"
                      description="Registra verificaciones físicas o ajusta los filtros."
                    />
                  </td>
                </tr>
              ) : (
                pagedInspections.items.map((insp) => (
                  <tr
                    key={insp.id}
                    onClick={() => setDetailInspection(insp)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3.5">
                      <p className="tabular-nums text-xs font-medium text-slate-900 dark:text-slate-100">
                        {formatDateTimeES(insp.inspectedAt)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {INSPECTION_TYPE_LABELS[insp.inspectionType] ??
                          insp.inspectionType}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {insp.warehouse.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {insp.lot
                          ? `${insp.lot.product.name} (${insp.lot.lotNumber})`
                          : "Inspección general de área"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                      {insp.inspectorName}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200">
                        {insp.checkedBoxes} cajas · {insp.checkedUnits} u.
                        sueltas
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Vencimiento:{" "}
                        {insp.expiryVerified ? "Verificado ✓" : "Sin verificar"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <InspectionStatusBadge status={insp.status} />
                    </td>
                    <td className="max-w-sm px-4 py-3.5">
                      <p className="line-clamp-2 text-xs text-slate-800 dark:text-slate-200">
                        {insp.findings}
                      </p>
                      {insp.correctiveAction && (
                        <p className="mt-1 truncate text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
                          Acción: {insp.correctiveAction}
                        </p>
                      )}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailInspection(insp)}
                          title="Ver detalle y evidencia"
                          aria-label="Ver detalle de inspección"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg(null);
                            setDeletingInspection(insp);
                          }}
                          title="Eliminar inspección"
                          aria-label="Eliminar inspección"
                          className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={pagedInspections.safePage}
        totalItems={pagedInspections.totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        itemLabel="inspecciones"
      />

      {/* Drawer Detalle de Inspección */}
      <DetailDrawer
        open={Boolean(detailInspection)}
        onClose={() => setDetailInspection(null)}
        title={
          detailInspection?.lot
            ? `${detailInspection.lot.product.name}`
            : "Inspección General de Área"
        }
        subtitle={
          detailInspection
            ? `${formatDateTimeES(detailInspection.inspectedAt)} · ${
                detailInspection.inspectorName
              }`
            : undefined
        }
        icon={
          <ClipboardCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        }
        badge={
          detailInspection && (
            <>
              <InspectionStatusBadge status={detailInspection.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {INSPECTION_TYPE_LABELS[detailInspection.inspectionType] ??
                  detailInspection.inspectionType}
              </span>
            </>
          )
        }
      >
        {detailInspection && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Conteo Verificado
                </p>
                <p className="tabular-nums mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {detailInspection.checkedBoxes} cajas ·{" "}
                  {detailInspection.checkedUnits} u.
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Etiqueta Vencimiento
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {detailInspection.expiryVerified
                    ? "Verificada ✓"
                    : "Sin verificar"}
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Hallazgos y Acción Correctiva
              </p>
              <p className="leading-relaxed text-slate-800 dark:text-slate-200">
                {detailInspection.findings}
              </p>
              {detailInspection.correctiveAction && (
                <div className="mt-2 rounded-lg bg-indigo-50/80 px-3 py-2 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                  <strong>Acción:</strong> {detailInspection.correctiveAction}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Evidencias Fotográficas
              </h3>
              <EvidenceGallery
                photos={detailPhotos}
                onChange={(next) => {
                  setDetailPhotos(next);
                  saveEvidencePhotos(`inspection:${detailInspection.id}`, next);
                }}
              />
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Historial de Actuaciones
              </h3>
              <EntityTimeline entityId={detailInspection.id} />
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* Modal Nueva Inspección organizada por secciones */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Registrar Inspección Física"
        subtitle="Verifica fechas de vencimiento, adjunta evidencias y sincroniza stock."
        icon={
          <ClipboardCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        }
        maxWidthClass="max-w-xl"
        closeDisabled={submitting}
        error={errorMsg}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={submitting}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="inspection-form"
              disabled={submitting}
              className="ui-btn ui-btn-primary"
            >
              {submitting ? "Guardando..." : "Guardar Inspección"}
            </button>
          </div>
        }
      >
        <form
          id="inspection-form"
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <FormSection step={1} title="Producto / Lote y Bodega">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bodega
              </label>
              <input
                readOnly
                value={warehouses[0]?.name || "Bodega Distrimarcas"}
                className="ui-input mt-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lote a Inspeccionar (opcional)
              </label>
              <SearchableCombobox
                options={lotComboOptions}
                value={form.lotId}
                onChange={handleLotChange}
                allowEmpty
                emptyOptionLabel="Inspección general de área"
                searchPlaceholder="Buscar por número de lote, SKU o producto..."
              />
            </div>
          </FormSection>

          <FormSection step={2} title="Responsable y Clasificación">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Inspector Responsable *
                </label>
                <input
                  required
                  value={form.inspectorName}
                  onChange={(e) =>
                    setForm({ ...form, inspectorName: e.target.value })
                  }
                  placeholder="Nombre completo"
                  className="ui-input mt-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tipo de Inspección
                </label>
                <select
                  value={form.inspectionType}
                  onChange={(e) =>
                    setForm({ ...form, inspectionType: e.target.value })
                  }
                  className="ui-select mt-1"
                >
                  <option value="PROGRAMADA">Programada</option>
                  <option value="SEGUIMIENTO_ALERTA">
                    Seguimiento de alerta
                  </option>
                  <option value="ALEATORIA">Aleatoria</option>
                  <option value="RECEPCION">Recepción en bodega</option>
                </select>
              </div>
            </div>
          </FormSection>

          <FormSection step={3} title="Resultado y Conteo Verificado">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resultado *
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="ui-select mt-1"
                >
                  <option value="APROBADA">Aprobada</option>
                  <option value="OBSERVACION">Con observación</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cajas Verif.
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.checkedBoxes}
                  onChange={(e) =>
                    setForm({ ...form, checkedBoxes: e.target.value })
                  }
                  className="ui-input mt-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unid. Sueltas
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.checkedUnits}
                  onChange={(e) =>
                    setForm({ ...form, checkedUnits: e.target.value })
                  }
                  className="ui-input mt-1"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.expiryVerified}
                  onChange={(e) =>
                    setForm({ ...form, expiryVerified: e.target.checked })
                  }
                />
                Fecha de vencimiento verificada físicamente en etiquetas
              </label>
              {form.lotId && (
                <label className="flex cursor-pointer items-center gap-2 font-semibold text-indigo-700 dark:text-indigo-400">
                  <input
                    type="checkbox"
                    checked={form.syncStockFromInspection}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        syncStockFromInspection: e.target.checked,
                      })
                    }
                  />
                  Actualizar stock del lote con estas cajas y unidades
                </label>
              )}
            </div>
          </FormSection>

          <FormSection step={4} title="Hallazgos y Evidencias Fotográficas">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Hallazgos de la Inspección *
              </label>
              <textarea
                required
                rows={2}
                value={form.findings}
                onChange={(e) => setForm({ ...form, findings: e.target.value })}
                placeholder="Describe el estado del producto, empaque y rotación..."
                className="ui-textarea mt-1"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Acción Correctiva / Recomendación
              </label>
              <input
                value={form.correctiveAction}
                onChange={(e) =>
                  setForm({ ...form, correctiveAction: e.target.value })
                }
                placeholder="Ej: Mover al frente para despacho FEFO inmediato"
                className="ui-input mt-1"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Evidencias Fotográficas
              </p>
              <EvidenceGallery photos={draftPhotos} onChange={setDraftPhotos} />
            </div>
          </FormSection>
        </form>
      </Modal>

      {/* Modal Eliminar Inspección */}
      <Modal
        open={Boolean(deletingInspection)}
        onClose={() => setDeletingInspection(null)}
        title="Eliminar registro de inspección"
        icon={
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        }
        maxWidthClass="max-w-md"
        closeDisabled={deletingBusy}
        error={errorMsg}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setDeletingInspection(null)}
              disabled={deletingBusy}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deletingBusy}
              className="ui-btn ui-btn-danger"
            >
              {deletingBusy ? "Eliminando..." : "Eliminar inspección"}
            </button>
          </div>
        }
      >
        {deletingInspection && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Deseas eliminar la inspección realizada por{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {deletingInspection.inspectorName}
            </strong>{" "}
            el{" "}
            <strong className="tabular-nums">
              {formatDateTimeES(deletingInspection.inspectedAt)}
            </strong>
            ?
          </p>
        )}
      </Modal>
    </div>
  );
}
