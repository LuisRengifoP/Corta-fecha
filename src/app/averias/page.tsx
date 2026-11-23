"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
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
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import {
  DAMAGE_ACTION_LABELS,
  DAMAGE_TYPE_LABELS,
  formatCurrencyCOP,
  formatDateES,
} from "@/lib/constants";

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

export default function AveriasPage() {
  const { notify } = useToast();
  const { user, refreshAlertsCount } = useAppSession();
  const operatorName = user?.fullName || "Supervisor de Calidad";

  const [statusFilter, setStatusFilter] = useState("");
  const [records, setRecords] = useState<DamagedItem[]>(
    () => getCached<DamagedItem[]>("damaged:") ?? []
  );
  const [lots, setLots] = useState<LotOption[]>(
    () => getCached<LotOption[]>("inventory:all") ?? []
  );
  const [loading, setLoading] = useState(() => !getCached("damaged:"));
  const [showModal, setShowModal] = useState(false);
  const [lotSearch, setLotSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DamagedItem | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<DamagedItem | null>(null);
  const [restoreStockOnDelete, setRestoreStockOnDelete] = useState(true);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    lotId: "",
    reportedBy: user?.fullName ?? "",
    damageType: "EMPAQUE_DANADO",
    severity: "MODERADA",
    boxesAffected: 0,
    looseUnitsAffected: 0,
    actionTaken: "CUARENTENA",
    stockDeducted: true,
    quarantineLot: false,
    notes: "",
  });

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
              if (!res.ok) return [];
              return (await res.json()).records ?? [];
            },
            { force, ttlMs: 15_000 }
          ),
          fetchWithCache<LotOption[]>(
            "inventory:all",
            async () => {
              const res = await fetch("/api/inventory");
              if (!res.ok) return [];
              return (await res.json()).lots ?? [];
            },
            { force, ttlMs: 20_000 }
          ),
        ]);
        setRecords(recList);
        setLots(lotsList);
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
    const lotIdParam = new URLSearchParams(window.location.search).get("lotId");
    if (lotIdParam && lots.length > 0) {
      const exists = lots.find((l) => l.id === lotIdParam);
      if (exists) {
        setForm((prev) => ({ ...prev, lotId: exists.id }));
        setShowModal(true);
      }
    }
  }, [lots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/damaged", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "No se pudo registrar la avería");
        return;
      }
      setShowModal(false);
      setLotSearch("");
      setForm({
        lotId: lots[0]?.id ?? "",
        reportedBy: operatorName,
        damageType: "EMPAQUE_DANADO",
        severity: "MODERADA",
        boxesAffected: 0,
        looseUnitsAffected: 0,
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/damaged/${editingRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateForm),
      });
      if (res.ok) {
        setEditingRecord(null);
        notify({
          title: "Gestión de avería actualizada",
          variant: "success",
        });
        await reloadAfterMutation();
      } else {
        notify({
          title: "No se pudo actualizar la avería",
          variant: "error",
        });
      }
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
        setErrorMsg(json.error || "No se pudo eliminar el registro de avería");
      } else {
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
    } finally {
      setDeletingBusy(false);
    }
  };

  const filteredModalLots = lotSearch.trim()
    ? lots.filter((l) =>
        `${l.lotNumber} ${l.product.sku} ${l.product.name}`
          .toLowerCase()
          .includes(lotSearch.trim().toLowerCase())
      )
    : lots;

  const pagedRecords = paginateItems(records, page, pageSize);

  const selectedLot = lots.find((l) => l.id === form.lotId);
  const previewUnits = selectedLot
    ? form.boxesAffected * selectedLot.product.unitsPerBox +
      form.looseUnitsAffected
    : 0;
  const previewLoss = selectedLot
    ? previewUnits * selectedLot.product.unitCost
    : 0;

  const totalLoss = records.reduce((acc, r) => acc + r.estimatedLoss, 0);
  const totalAffectedUnits = records.reduce(
    (acc, r) => acc + r.unitsAffected,
    0
  );
  const openCases = records.filter(
    (r) => r.resolutionStatus !== "RESUELTO"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Gestión de Productos Averiados
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Registro de novedades físicas, descuento automático de inventario,
            cuarentena y trazabilidad de resolución.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setLotSearch("");
              setForm((prev) => ({
                ...prev,
                lotId: prev.lotId || lots[0]?.id || "",
                reportedBy: prev.reportedBy || operatorName,
              }));
              setShowModal(true);
            }}
            className="ui-btn ui-btn-orange col-span-2 sm:col-span-1"
          >
            <Plus className="h-4 w-4" />
            Reportar Avería
          </button>
          <a
            href="/api/reports/export?type=damaged"
            className="ui-btn ui-btn-emerald"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            <span className="truncate">Excel</span>
          </a>
          <a
            href="/api/reports/export?type=damaged&format=pdf"
            className="ui-btn ui-btn-rose"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">PDF</span>
          </a>
        </div>
      </div>

      {/* KPIs de averías */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="ui-card border-l-4 border-l-orange-500 p-3.5 sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Casos Abiertos
          </p>
          <p className="tabular-nums mt-1 text-xl font-bold text-orange-700 dark:text-orange-400 sm:text-2xl">
            {openCases}
          </p>
        </div>
        <div className="ui-card border-l-4 border-l-indigo-500 p-3.5 sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Unidades Afectadas
          </p>
          <p className="tabular-nums mt-1 text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
            {totalAffectedUnits.toLocaleString("es-CO")} u.
          </p>
        </div>
        <div className="ui-card col-span-2 border-l-4 border-l-red-500 p-3.5 sm:col-span-1 sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Impacto Económico Estimado
          </p>
          <p className="tabular-nums mt-1 text-xl font-bold text-red-700 dark:text-red-400 sm:text-2xl">
            {formatCurrencyCOP(totalLoss)}
          </p>
        </div>
      </div>

      {/* Filtro */}
      <div className="ui-card flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Estado de gestión
        </span>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrar averías por estado de gestión"
          className="ui-select sm:w-52"
        >
          <option value="">Todos</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="EN_GESTION">En gestión</option>
          <option value="RESUELTO">Resuelto</option>
        </select>
      </div>

      {/* Vista móvil/tablet en tarjetas */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando registros...
          </div>
        ) : records.length === 0 ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay productos averiados registrados.
          </div>
        ) : (
          pagedRecords.items.map((rec) => (
            <div key={rec.id} className="ui-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
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
                </div>
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
                    onClick={() => {
                      setEditingRecord(rec);
                      setUpdateForm({
                        resolutionStatus: rec.resolutionStatus,
                        actionTaken: rec.actionTaken,
                        notes: rec.notes ?? "",
                        actor: operatorName,
                      });
                    }}
                    className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs"
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
                    className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/60"
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
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    No hay productos averiados registrados.
                  </td>
                </tr>
              ) : (
                pagedRecords.items.map((rec) => (
                  <tr
                    key={rec.id}
                    className="transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
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
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRecord(rec);
                            setUpdateForm({
                              resolutionStatus: rec.resolutionStatus,
                              actionTaken: rec.actionTaken,
                              notes: rec.notes ?? "",
                              actor: operatorName,
                            });
                          }}
                          className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs"
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
                          title="Eliminar avería errónea"
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

      {/* Modal Reportar Avería */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Reportar Producto Averiado"
        subtitle="Calcula automáticamente la pérdida y permite descontar stock o bloquear el lote."
        icon={
          <ShieldAlert className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        }
        maxWidthClass="max-w-lg"
        closeDisabled={submitting}
      >
        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300">
            {errorMsg}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Lote Afectado *
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={lotSearch}
                onChange={(e) => setLotSearch(e.target.value)}
                placeholder="Filtrar lote por número, SKU o producto..."
                className="ui-input py-1.5 pl-8 text-xs"
              />
            </div>
            <select
              required
              value={form.lotId}
              onChange={(e) => setForm({ ...form, lotId: e.target.value })}
              className="ui-select mt-1.5"
            >
              <option value="">Seleccione un lote...</option>
              {filteredModalLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber} — {l.product.name} ({l.warehouse.name},{" "}
                  {l.quantityText || `${l.totalUnits} u.`})
                </option>
              ))}
            </select>
          </div>

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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Severidad
              </label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
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
                min={0}
                value={form.boxesAffected}
                onChange={(e) =>
                  setForm({
                    ...form,
                    boxesAffected: Number(e.target.value),
                  })
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
                min={0}
                value={form.looseUnitsAffected}
                onChange={(e) =>
                  setForm({
                    ...form,
                    looseUnitsAffected: Number(e.target.value),
                  })
                }
                className="ui-input mt-1"
              />
            </div>
          </div>

          {selectedLot && (
            <div className="tabular-nums rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-xs text-orange-900 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-200">
              Total afectado: <strong>{previewUnits} unidades</strong> · Pérdida
              estimada: <strong>{formatCurrencyCOP(previewLoss)}</strong>
            </div>
          )}

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

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Descripción / Evidencia de Novedad
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Detalle del daño observado..."
              className="ui-textarea mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
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
              disabled={submitting}
              className="ui-btn ui-btn-orange"
            >
              {submitting ? "Registrando..." : "Registrar Avería"}
            </button>
          </div>
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
        maxWidthClass="max-w-md"
        closeDisabled={updating}
      >
        {editingRecord && (
          <form onSubmit={handleUpdateResolution} className="space-y-4">
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
                  setUpdateForm({
                    ...updateForm,
                    actionTaken: e.target.value,
                  })
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
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
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
                disabled={updating}
                className="ui-btn ui-btn-primary"
              >
                {updating ? "Actualizando..." : "Actualizar Gestión"}
              </button>
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
            {errorMsg && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300">
                {errorMsg}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
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
          </>
        )}
      </Modal>
    </div>
  );
}
