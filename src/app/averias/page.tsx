"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  DollarSign,
  Eye,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import {
  ResolutionStatusBadge,
  SeverityBadge,
} from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { EntityTimeline } from "@/components/ui/EntityTimeline";
import { EvidenceGallery } from "@/components/ui/EvidenceGallery";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { FormSection } from "@/components/ui/FormSection";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProcessStepper } from "@/components/ui/ProcessStepper";
import {
  ComboboxOption,
  SearchableCombobox,
} from "@/components/ui/SearchableCombobox";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import {
  DAMAGE_ACTION_LABELS,
  DAMAGE_TYPE_LABELS,
  formatCurrencyCOP,
  formatDateES,
  formatDateTimeES,
} from "@/lib/constants";
import {
  EvidencePhoto,
  loadEvidencePhotos,
  saveEvidencePhotos,
} from "@/lib/evidence-store";

interface LotOption {
  id: string;
  lotNumber: string;
  totalUnits: number;
  quantityText?: string;
  product: { name: string; sku: string; unitsPerBox: number; unitCost: number };
  warehouse: { id: string; name: string };
}

interface DamagedItem {
  id: string;
  reportedBy: string;
  damageType: string;
  severity: string;
  boxesAffected: number;
  unitsAffected: number;
  estimatedLoss: number;
  actionTaken: string;
  resolutionStatus: string;
  stockDeducted: boolean;
  notes: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  lot: { lotNumber: string };
  product: { name: string; sku: string };
  warehouse: { name: string };
}

const PROCESS_STEPS = [
  { key: "PENDIENTE", label: "Pendiente", description: "Novedad reportada" },
  { key: "EN_GESTION", label: "En gestión", description: "En tratamiento" },
  { key: "RESUELTO", label: "Resuelto", description: "Caso cerrado" },
];

export default function AveriasPage() {
  const { notify } = useToast();
  const { user, warehouseName, refreshAlertsCount } = useAppSession();
  const operatorName = user?.fullName || "Supervisor de Calidad";

  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<DamagedItem[]>(
    () => getCached<DamagedItem[]>("damaged:") ?? []
  );
  const [lots, setLots] = useState<LotOption[]>(
    () => getCached<LotOption[]>("inventory:all") ?? []
  );
  const [loading, setLoading] = useState(() => !getCached("damaged:"));
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [detailRecord, setDetailRecord] = useState<DamagedItem | null>(null);
  const [detailPhotos, setDetailPhotos] = useState<EvidencePhoto[]>([]);
  const [draftPhotos, setDraftPhotos] = useState<EvidencePhoto[]>([]);
  const [editingRecord, setEditingRecord] = useState<DamagedItem | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<DamagedItem | null>(
    null
  );
  const [restoreStockOnDelete, setRestoreStockOnDelete] = useState(true);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const handledLotParamRef = useRef(false);

  const [form, setForm] = useState({
    lotId: "",
    reportedBy: user?.fullName ?? "",
    damageType: "EMPAQUE_DANADO",
    severity: "MODERADA",
    boxesAffected: "",
    looseUnitsAffected: "",
    actionTaken: "CUARENTENA",
    stockDeducted: true,
    quarantineLot: false,
    notes: "",
  });

  const toNonNegInt = (val: string | number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };

  const [updateForm, setUpdateForm] = useState({
    resolutionStatus: "EN_GESTION",
    actionTaken: "CUARENTENA",
    notes: "",
    actor: operatorName,
  });

  useEffect(() => {
    if (user?.fullName) {
      setForm((prev) => ({
        ...prev,
        reportedBy: prev.reportedBy || user.fullName,
      }));
      setUpdateForm((prev) => ({
        ...prev,
        actor: user.fullName,
      }));
    }
  }, [user?.fullName]);

  useEffect(() => {
    if (detailRecord) {
      setDetailPhotos(loadEvidencePhotos(`damaged:${detailRecord.id}`));
    } else {
      setDetailPhotos([]);
    }
  }, [detailRecord]);

  const loadData = useCallback(
    async (force = false) => {
      const cacheKey = `damaged:${statusFilter}`;
      if (!getCached(cacheKey)) {
        setLoading(true);
      }
      try {
        const q = new URLSearchParams();
        if (statusFilter) q.set("resolutionStatus", statusFilter);
        const [recList, lotsList] = await Promise.all([
          fetchWithCache<DamagedItem[]>(
            cacheKey,
            async () => {
              const res = await fetch(`/api/damaged?${q.toString()}`);
              if (!res.ok) throw new Error("No se pudieron cargar averías");
              return (await res.json()).records ?? [];
            },
            { force, ttlMs: 15_000 }
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
        setRecords(recList);
        setLots(lotsList);
      } catch {
        // Mantener estado previo en caso de error transitorio
      } finally {
        setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const reloadAfterMutation = useCallback(async () => {
    invalidateCache("damaged:");
    invalidateCache("inventory:");
    invalidateCache("dashboard:");
    invalidateCache("alerts:");
    await Promise.all([loadData(true), refreshAlertsCount()]);
  }, [loadData, refreshAlertsCount]);

  useEffect(() => {
    if (handledLotParamRef.current || lots.length === 0) return;
    const lotIdParam = new URLSearchParams(window.location.search).get("lotId");
    if (lotIdParam) {
      handledLotParamRef.current = true;
      const exists = lots.find((l) => l.id === lotIdParam);
      if (exists) {
        setForm((prev) => ({ ...prev, lotId: exists.id }));
        setDraftPhotos([]);
        setShowModal(true);
      }
    }
  }, [lots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const boxes = toNonNegInt(form.boxesAffected);
    const loose = toNonNegInt(form.looseUnitsAffected);
    if (!form.lotId) {
      setErrorMsg("Selecciona el lote afectado.");
      return;
    }
    if (!form.reportedBy.trim()) {
      setErrorMsg("Indica el nombre de quien reporta la avería.");
      return;
    }
    if (boxes + loose <= 0) {
      setErrorMsg("Ingresa al menos 1 caja o 1 unidad afectada.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/damaged", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          boxesAffected: boxes,
          looseUnitsAffected: loose,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "No se pudo registrar la avería";
        setErrorMsg(msg);
        notify({ title: "No se pudo guardar", description: msg, variant: "error" });
        return;
      }
      if (json.record?.id && draftPhotos.length > 0) {
        saveEvidencePhotos(`damaged:${json.record.id}`, draftPhotos);
      }
      setShowModal(false);
      setDraftPhotos([]);
      setForm({
        lotId: lots[0]?.id ?? "",
        reportedBy: operatorName,
        damageType: "EMPAQUE_DANADO",
        severity: "MODERADA",
        boxesAffected: "",
        looseUnitsAffected: "",
        actionTaken: "CUARENTENA",
        stockDeducted: true,
        quarantineLot: false,
        notes: "",
      });
      notify({
        title: "Avería reportada",
        description: form.stockDeducted
          ? "La novedad se registró y las unidades fueron descontadas del lote."
          : "La novedad quedó registrada para seguimiento.",
        variant: "success",
      });
      await reloadAfterMutation();
    } catch {
      const msg = "Error de conexión al registrar la avería.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setErrorMsg(null);
    setUpdating(true);
    try {
      const res = await fetch(`/api/damaged/${editingRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateForm),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        if (detailRecord?.id === editingRecord.id && json.record) {
          setDetailRecord(json.record);
        }
        setEditingRecord(null);
        notify({
          title: "Gestión de avería actualizada",
          variant: "success",
        });
        await reloadAfterMutation();
      } else {
        const msg = json.error || "No se pudo actualizar la avería";
        setErrorMsg(msg);
        notify({ title: "Error al actualizar", description: msg, variant: "error" });
      }
    } catch {
      const msg = "Error de conexión al actualizar la avería.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!deletingRecord) return;
    setDeletingBusy(true);
    setErrorMsg(null);
    try {
      const restored = deletingRecord.stockDeducted && restoreStockOnDelete;
      const q = new URLSearchParams({
        restoreStock: String(restored),
        actor: operatorName,
      });
      const res = await fetch(
        `/api/damaged/${deletingRecord.id}?${q.toString()}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "No se pudo eliminar el registro de avería";
        setErrorMsg(msg);
        notify({ title: "Error al eliminar", description: msg, variant: "error" });
      } else {
        saveEvidencePhotos(`damaged:${deletingRecord.id}`, []);
        if (detailRecord?.id === deletingRecord.id) {
          setDetailRecord(null);
        }
        setDeletingRecord(null);
        notify({
          title: "Avería eliminada",
          description: restored
            ? "Las unidades afectadas fueron restauradas al inventario del lote."
            : undefined,
          variant: "info",
        });
        await reloadAfterMutation();
      }
    } catch {
      const msg = "Error de conexión al eliminar la avería.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setDeletingBusy(false);
    }
  };

  const visibleRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (severityFilter && r.severity !== severityFilter) return false;
      if (!q) return true;
      return `${r.product.sku} ${r.product.name} ${r.lot.lotNumber} ${
        r.reportedBy
      } ${r.notes ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [records, search, severityFilter]);

  const lotComboOptions: ComboboxOption[] = useMemo(
    () =>
      lots.map((l) => ({
        value: l.id,
        badge: l.product.sku,
        label: `${l.lotNumber} — ${l.product.name}`,
        sublabel: `${l.warehouse.name} · ${
          l.quantityText || `${l.totalUnits} u.`
        }`,
        searchText: `${l.lotNumber} ${l.product.sku} ${l.product.name}`,
      })),
    [lots]
  );

  const pagedRecords = paginateItems(visibleRecords, page, pageSize);

  const selectedLot = lots.find((l) => l.id === form.lotId);
  const previewUnits = selectedLot
    ? toNonNegInt(form.boxesAffected) * selectedLot.product.unitsPerBox +
      toNonNegInt(form.looseUnitsAffected)
    : 0;
  const previewLoss = selectedLot
    ? previewUnits * selectedLot.product.unitCost
    : 0;

  const totalLoss = visibleRecords.reduce((acc, r) => acc + r.estimatedLoss, 0);
  const totalAffectedUnits = visibleRecords.reduce(
    (acc, r) => acc + r.unitsAffected,
    0
  );
  const openCases = visibleRecords.filter(
    (r) => r.resolutionStatus !== "RESUELTO"
  ).length;
  const hasActiveFilters = Boolean(search || statusFilter || severityFilter);

  const openEditRecord = (rec: DamagedItem) => {
    setErrorMsg(null);
    setEditingRecord(rec);
    setUpdateForm({
      resolutionStatus: rec.resolutionStatus,
      actionTaken: rec.actionTaken,
      notes: rec.notes ?? "",
      actor: operatorName,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos Averiados"
        badge={warehouseName}
        description="Registro de novedades físicas, evidencias fotográficas, impacto económico y seguimiento de resolución."
        exports={[
          {
            label: "Excel",
            href: "/api/reports/export?type=damaged",
            format: "xlsx",
          },
          {
            label: "PDF",
            href: "/api/reports/export?type=damaged&format=pdf",
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
                lotId: prev.lotId || lots[0]?.id || "",
                reportedBy: prev.reportedBy || operatorName,
              }));
              setShowModal(true);
            }}
            className="ui-btn ui-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Reportar Avería
          </button>
        }
      />

      {/* KPIs de averías */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard
          label="Casos Abiertos"
          value={openCases}
          sublabel="Pendientes o en gestión"
          icon={<ShieldAlert className="h-4 w-4" />}
          tone="orange"
        />
        <KpiCard
          label="Unidades Afectadas"
          value={`${totalAffectedUnits.toLocaleString("es-CO")} u.`}
          sublabel="Total en vista actual"
          icon={<Boxes className="h-4 w-4" />}
          tone="indigo"
        />
        <KpiCard
          label="Impacto Estimado"
          value={formatCurrencyCOP(totalLoss)}
          sublabel="Costo unitario × afectadas"
          icon={<DollarSign className="h-4 w-4" />}
          tone="red"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Filtro */}
      <FilterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Buscar por SKU, producto, lote, reportado por o detalle..."
        resultCount={visibleRecords.length}
        resultLabel="registro(s) de avería"
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          setSearch("");
          setStatusFilter("");
          setSeverityFilter("");
          setPage(1);
        }}
        tabs={
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "", label: "Todos" },
              { id: "PENDIENTE", label: "Pendientes" },
              { id: "EN_GESTION", label: "En gestión" },
              { id: "RESUELTO", label: "Resueltos" },
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
        filters={
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por severidad"
            className="ui-select sm:w-44"
          >
            <option value="">Todas severidades</option>
            <option value="LEVE">Leve</option>
            <option value="MODERADA">Moderada</option>
            <option value="PERDIDA_TOTAL">Pérdida total</option>
          </select>
        }
      />

      {/* Vista móvil/tablet en tarjetas */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando registros...
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Sin productos averiados"
              description="No hay novedades registradas con los filtros aplicados."
            />
          </div>
        ) : (
          pagedRecords.items.map((rec) => (
            <div key={rec.id} className="ui-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetailRecord(rec)}
                  className="min-w-0 text-left"
                >
                  <p className="tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400">
                    {formatDateES(rec.reportedAt)} · {rec.reportedBy}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {rec.product.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lote <span className="font-mono">{rec.lot.lotNumber}</span>{" "}
                    · {rec.warehouse.name}
                  </p>
                </button>
                <ResolutionStatusBadge status={rec.resolutionStatus} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {DAMAGE_TYPE_LABELS[rec.damageType] ?? rec.damageType}
                  </p>
                  <div className="mt-1">
                    <SeverityBadge severity={rec.severity} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="tabular-nums font-bold text-slate-900 dark:text-slate-100">
                    {rec.unitsAffected} u. ({rec.boxesAffected} cajas)
                  </p>
                  <p className="tabular-nums font-semibold text-red-700 dark:text-red-400">
                    {formatCurrencyCOP(rec.estimatedLoss)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {DAMAGE_ACTION_LABELS[rec.actionTaken] ?? rec.actionTaken}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailRecord(rec)}
                    className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ficha
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditRecord(rec)}
                    className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setRestoreStockOnDelete(rec.stockDeducted);
                      setDeletingRecord(rec);
                    }}
                    aria-label="Eliminar avería"
                    className="ui-btn ui-btn-ghost border border-red-200 p-1.5 text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabla escritorio */}
      <div className="ui-card hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Fecha / Reportó</th>
                <th className="px-4 py-3">Producto / Lote</th>
                <th className="px-4 py-3">Tipo y Severidad</th>
                <th className="px-4 py-3">Afectación</th>
                <th className="px-4 py-3">Acción / Estado</th>
                <th className="px-4 py-3 text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    Cargando registros...
                  </td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<ShieldAlert className="h-6 w-6" />}
                      title="Sin productos averiados"
                      description="No hay novedades registradas con los filtros aplicados."
                    />
                  </td>
                </tr>
              ) : (
                pagedRecords.items.map((rec) => (
                  <tr
                    key={rec.id}
                    onClick={() => setDetailRecord(rec)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3.5">
                      <p className="tabular-nums text-xs font-medium text-slate-900 dark:text-slate-100">
                        {formatDateES(rec.reportedAt)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {rec.reportedBy}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {rec.product.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Lote{" "}
                        <span className="font-mono">{rec.lot.lotNumber}</span> ·{" "}
                        {rec.warehouse.name}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        {DAMAGE_TYPE_LABELS[rec.damageType] ?? rec.damageType}
                      </p>
                      <div className="mt-1">
                        <SeverityBadge severity={rec.severity} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {rec.unitsAffected} u. ({rec.boxesAffected} cajas)
                      </p>
                      <p className="tabular-nums text-xs font-medium text-red-700 dark:text-red-400">
                        {formatCurrencyCOP(rec.estimatedLoss)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="mb-1 text-xs text-slate-700 dark:text-slate-300">
                        {DAMAGE_ACTION_LABELS[rec.actionTaken] ??
                          rec.actionTaken}
                      </p>
                      <ResolutionStatusBadge status={rec.resolutionStatus} />
                    </td>
                    <td
                      className="px-4 py-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailRecord(rec)}
                          title="Ver ficha, evidencias e historial"
                          aria-label="Ver ficha de avería"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditRecord(rec)}
                          className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                        >
                          Actualizar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg(null);
                            setRestoreStockOnDelete(rec.stockDeducted);
                            setDeletingRecord(rec);
                          }}
                          title="Eliminar avería"
                          aria-label="Eliminar avería"
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
        currentPage={pagedRecords.safePage}
        totalItems={pagedRecords.totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        itemLabel="averías"
      />

      {/* Drawer Detalle del Caso de Avería */}
      <DetailDrawer
        open={Boolean(detailRecord)}
        onClose={() => setDetailRecord(null)}
        title={detailRecord ? detailRecord.product.name : ""}
        subtitle={
          detailRecord
            ? `${detailRecord.product.sku} · Lote ${detailRecord.lot.lotNumber}`
            : undefined
        }
        icon={
          <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        }
        badge={
          detailRecord && (
            <>
              <ResolutionStatusBadge status={detailRecord.resolutionStatus} />
              <SeverityBadge severity={detailRecord.severity} />
            </>
          )
        }
        footer={
          detailRecord && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setRestoreStockOnDelete(detailRecord.stockDeducted);
                  setDeletingRecord(detailRecord);
                }}
                className="ui-btn ui-btn-ghost px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
              <button
                type="button"
                onClick={() => openEditRecord(detailRecord)}
                className="ui-btn ui-btn-primary py-1.5 text-xs"
              >
                Actualizar Gestión
              </button>
            </div>
          )
        }
      >
        {detailRecord && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Estado del Proceso
              </p>
              <ProcessStepper
                steps={PROCESS_STEPS}
                currentKey={detailRecord.resolutionStatus}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Afectación
                </p>
                <p className="tabular-nums mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {detailRecord.unitsAffected} u. ({detailRecord.boxesAffected}{" "}
                  cajas)
                </p>
                <p className="text-[11px] text-slate-500">
                  {detailRecord.stockDeducted
                    ? "Descontado del stock"
                    : "Sin descuento de stock"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Impacto Económico
                </p>
                <p className="tabular-nums mt-1 text-sm font-bold text-red-700 dark:text-red-400">
                  {formatCurrencyCOP(detailRecord.estimatedLoss)}
                </p>
                <p className="text-[11px] text-slate-500">
                  Reportado: {formatDateTimeES(detailRecord.reportedAt)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Detalle y Disposición
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Tipo:</strong>{" "}
                {DAMAGE_TYPE_LABELS[detailRecord.damageType] ??
                  detailRecord.damageType}
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Acción:</strong>{" "}
                {DAMAGE_ACTION_LABELS[detailRecord.actionTaken] ??
                  detailRecord.actionTaken}
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Reportó:</strong> {detailRecord.reportedBy}
              </p>
              {detailRecord.notes && (
                <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  {detailRecord.notes}
                </p>
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
                  saveEvidencePhotos(`damaged:${detailRecord.id}`, next);
                }}
              />
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Historial de Actuaciones
              </h3>
              <EntityTimeline entityId={detailRecord.id} />
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* Modal Reportar Avería por Secciones */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Reportar Producto Averiado"
        subtitle="Calcula automáticamente la pérdida, adjunta evidencias y actualiza stock."
        icon={
          <ShieldAlert className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
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
              form="damaged-create-form"
              disabled={submitting}
              className="ui-btn ui-btn-primary"
            >
              {submitting ? "Registrando..." : "Registrar Avería"}
            </button>
          </div>
        }
      >
        <form
          id="damaged-create-form"
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <FormSection step={1} title="Producto y Lote Afectado">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lote Afectado *
              </label>
              <SearchableCombobox
                options={lotComboOptions}
                value={form.lotId}
                onChange={(val) => setForm({ ...form, lotId: val })}
                placeholder="Seleccione un lote..."
                searchPlaceholder="Buscar por número de lote, SKU o producto..."
              />
            </div>
          </FormSection>

          <FormSection step={2} title="Clasificación y Responsable">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reportado por *
                </label>
                <input
                  required
                  value={form.reportedBy}
                  onChange={(e) =>
                    setForm({ ...form, reportedBy: e.target.value })
                  }
                  placeholder="Nombre del operario"
                  className="ui-input mt-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tipo de Avería *
                </label>
                <select
                  value={form.damageType}
                  onChange={(e) =>
                    setForm({ ...form, damageType: e.target.value })
                  }
                  className="ui-select mt-1"
                >
                  {Object.entries(DAMAGE_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Severidad
                </label>
                <select
                  value={form.severity}
                  onChange={(e) =>
                    setForm({ ...form, severity: e.target.value })
                  }
                  className="ui-select mt-1"
                >
                  <option value="LEVE">Leve</option>
                  <option value="MODERADA">Moderada</option>
                  <option value="PERDIDA_TOTAL">Pérdida total</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cajas Afectadas
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={form.boxesAffected}
                  onChange={(e) =>
                    setForm({ ...form, boxesAffected: e.target.value })
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
                  placeholder="0"
                  value={form.looseUnitsAffected}
                  onChange={(e) =>
                    setForm({ ...form, looseUnitsAffected: e.target.value })
                  }
                  className="ui-input mt-1"
                />
              </div>
            </div>

            {selectedLot && (
              <div className="tabular-nums rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-2 text-xs text-orange-900 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-200">
                Total afectado: <strong>{previewUnits} unidades</strong> ·
                Pérdida estimada:{" "}
                <strong>{formatCurrencyCOP(previewLoss)}</strong>
              </div>
            )}
          </FormSection>

          <FormSection step={3} title="Disposición y Control de Stock">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Acción Tomada
              </label>
              <select
                value={form.actionTaken}
                onChange={(e) =>
                  setForm({ ...form, actionTaken: e.target.value })
                }
                className="ui-select mt-1"
              >
                {Object.entries(DAMAGE_ACTION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.stockDeducted}
                  onChange={(e) =>
                    setForm({ ...form, stockDeducted: e.target.checked })
                  }
                />
                Descontar unidades afectadas del inventario disponible del lote
              </label>
              <label className="flex cursor-pointer items-center gap-2 font-semibold text-purple-700 dark:text-purple-400">
                <input
                  type="checkbox"
                  checked={form.quarantineLot}
                  onChange={(e) =>
                    setForm({ ...form, quarantineLot: e.target.checked })
                  }
                />
                Bloquear lote completo en estado Cuarentena
              </label>
            </div>
          </FormSection>

          <FormSection step={4} title="Descripción y Evidencias Fotográficas">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Descripción de Novedad
              </label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Detalle del daño observado..."
                className="ui-textarea mt-1"
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

      {/* Modal Actualizar Resolución */}
      <Modal
        open={Boolean(editingRecord)}
        onClose={() => setEditingRecord(null)}
        title={
          editingRecord
            ? `Gestionar Avería — ${editingRecord.product.name}`
            : ""
        }
        icon={
          <ShieldAlert className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        }
        maxWidthClass="max-w-lg"
        closeDisabled={updating}
        error={errorMsg}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setEditingRecord(null)}
              disabled={updating}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="damaged-update-form"
              disabled={updating}
              className="ui-btn ui-btn-primary"
            >
              {updating ? "Actualizando..." : "Actualizar Gestión"}
            </button>
          </div>
        }
      >
        {editingRecord && (
          <form
            id="damaged-update-form"
            noValidate
            onSubmit={handleUpdateResolution}
            className="space-y-4"
          >
            <ProcessStepper
              steps={PROCESS_STEPS}
              currentKey={updateForm.resolutionStatus}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Estado de Resolución
              </label>
              <select
                value={updateForm.resolutionStatus}
                onChange={(e) =>
                  setUpdateForm({
                    ...updateForm,
                    resolutionStatus: e.target.value,
                  })
                }
                className="ui-select mt-1"
              >
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_GESTION">En gestión</option>
                <option value="RESUELTO">Resuelto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Disposición Final
              </label>
              <select
                value={updateForm.actionTaken}
                onChange={(e) =>
                  setUpdateForm({ ...updateForm, actionTaken: e.target.value })
                }
                className="ui-select mt-1"
              >
                {Object.entries(DAMAGE_ACTION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Responsable de actualización
              </label>
              <input
                value={updateForm.actor}
                onChange={(e) =>
                  setUpdateForm({ ...updateForm, actor: e.target.value })
                }
                className="ui-input mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Notas de seguimiento
              </label>
              <textarea
                rows={2}
                value={updateForm.notes}
                onChange={(e) =>
                  setUpdateForm({ ...updateForm, notes: e.target.value })
                }
                className="ui-textarea mt-1"
              />
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Eliminar Avería */}
      <Modal
        open={Boolean(deletingRecord)}
        onClose={() => setDeletingRecord(null)}
        title="Eliminar registro de avería"
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
              onClick={() => setDeletingRecord(null)}
              disabled={deletingBusy}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteRecord}
              disabled={deletingBusy}
              className="ui-btn ui-btn-danger"
            >
              {deletingBusy ? "Eliminando..." : "Eliminar avería"}
            </button>
          </div>
        }
      >
        {deletingRecord && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ¿Eliminar la avería de{" "}
              <strong className="text-slate-900 dark:text-slate-100">
                {deletingRecord.product.name}
              </strong>{" "}
              (Lote{" "}
              <strong className="font-mono">
                {deletingRecord.lot.lotNumber}
              </strong>
              , {deletingRecord.unitsAffected} u.)?
            </p>
            {deletingRecord.stockDeducted && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
                <input
                  type="checkbox"
                  checked={restoreStockOnDelete}
                  onChange={(e) => setRestoreStockOnDelete(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span>
                  Restaurar las{" "}
                  <strong>{deletingRecord.unitsAffected} unidades</strong>{" "}
                  descontadas al inventario del lote (recomendado si fue un
                  registro erróneo).
                </span>
              </label>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
