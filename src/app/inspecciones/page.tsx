"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import { InspectionStatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import { formatDateTimeES, INSPECTION_TYPE_LABELS } from "@/lib/constants";

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
    lotNumber: string;
    product: { name: string; sku: string };
  } | null;
}

export default function InspeccionesPage() {
  const { notify } = useToast();
  const { user, refreshAlertsCount } = useAppSession();
  const operatorName = user?.fullName || "Supervisor de Calidad";

  const [statusFilter, setStatusFilter] = useState("");
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
  const [lotSearch, setLotSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [deletingInspection, setDeletingInspection] =
    useState<InspectionItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [form, setForm] = useState({
    warehouseId: warehouses[0]?.id ?? "",
    lotId: "",
    inspectorName: user?.fullName ?? "",
    inspectionType: "PROGRAMADA",
    status: "APROBADA",
    checkedBoxes: 0,
    checkedUnits: 0,
    expiryVerified: true,
    syncStockFromInspection: false,
    findings: "",
    correctiveAction: "",
  });

  useEffect(() => {
    if (user?.fullName) {
      setForm((prev) => ({
        ...prev,
        inspectorName: prev.inspectorName || user.fullName,
      }));
    }
  }, [user?.fullName]);

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
              if (!res.ok) return [];
              return (await res.json()).inspections ?? [];
            },
            { force, ttlMs: 15_000 }
          ),
          fetchWithCache<Warehouse[]>(
            "ref:warehouses",
            async () => {
              const res = await fetch("/api/warehouses");
              if (!res.ok) return [];
              return (await res.json()).warehouses ?? [];
            },
            { force: false, ttlMs: 120_000 }
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

        setInspections(inspList);
        setWarehouses(whList);
        setLots(lotsList);
        if (whList[0]?.id) {
          setForm((prev) => ({
            ...prev,
            warehouseId: prev.warehouseId || whList[0].id,
          }));
        }
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
    const lotIdParam = new URLSearchParams(window.location.search).get("lotId");
    if (lotIdParam && lots.length > 0) {
      const target = lots.find((l) => l.id === lotIdParam);
      if (target) {
        setForm((prev) => ({
          ...prev,
          warehouseId: target.warehouseId,
          lotId: target.id,
          checkedBoxes: target.boxes,
          checkedUnits: target.looseUnits,
        }));
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
      checkedBoxes: target ? target.boxes : prev.checkedBoxes,
      checkedUnits: target ? target.looseUnits : prev.checkedUnits,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lotId: form.lotId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "No se pudo registrar la inspección");
        return;
      }
      const synced = form.syncStockFromInspection && Boolean(form.lotId);
      setShowModal(false);
      setLotSearch("");
      setForm({
        warehouseId: warehouses[0]?.id ?? "",
        lotId: "",
        inspectorName: operatorName,
        inspectionType: "PROGRAMADA",
        status: "APROBADA",
        checkedBoxes: 0,
        checkedUnits: 0,
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
        setErrorMsg(json.error || "No se pudo eliminar la inspección");
      } else {
        setDeletingInspection(null);
        notify({
          title: "Inspección eliminada",
          variant: "info",
        });
        invalidateCache("inspections:");
        invalidateCache("dashboard:");
        await loadData(true);
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

  const pagedInspections = paginateItems(inspections, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Control de Inspecciones en Bodega
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Bitácora de verificaciones físicas, validación de fechas de
            vencimiento y ajuste de conteo por lote.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setLotSearch("");
              setForm((prev) => ({
                ...prev,
                warehouseId: prev.warehouseId || warehouses[0]?.id || "",
                inspectorName: prev.inspectorName || operatorName,
              }));
              setShowModal(true);
            }}
            className="ui-btn ui-btn-primary"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">Nueva Inspección</span>
          </button>
          <a
            href="/api/reports/export?type=inspections"
            className="ui-btn ui-btn-emerald"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            <span className="truncate">Exportar Excel</span>
          </a>
        </div>
      </div>

      {/* Filtros */}
      <div className="ui-card flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {warehouses[0]?.name || "Bodega Distrimarcas"}
        </span>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrar inspecciones por resultado"
          className="ui-select sm:w-56"
        >
          <option value="">Todos los resultados</option>
          <option value="APROBADA">Aprobada</option>
          <option value="OBSERVACION">Con observación</option>
          <option value="CRITICA">Crítica</option>
        </select>
      </div>

      {/* Vista móvil en tarjetas */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando inspecciones...
          </div>
        ) : inspections.length === 0 ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay inspecciones registradas aún.
          </div>
        ) : (
          pagedInspections.items.map((insp) => (
            <div key={insp.id} className="ui-card space-y-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateTimeES(insp.inspectedAt)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {INSPECTION_TYPE_LABELS[insp.inspectionType] ??
                      insp.inspectionType}{" "}
                    · {insp.inspectorName}
                  </p>
                </div>
                <InspectionStatusBadge status={insp.status} />
              </div>

              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {insp.lot
                  ? `${insp.lot.product.name} (${insp.lot.lotNumber})`
                  : "Inspección general de área"}
              </p>

              <div className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
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

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setDeletingInspection(insp);
                  }}
                  className="ui-btn border border-red-200 bg-red-50 py-1.5 text-xs text-red-700 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
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
                <th className="px-4 py-3">Hallazgos y Acción</th>
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
              ) : inspections.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    No hay inspecciones registradas aún.
                  </td>
                </tr>
              ) : (
                pagedInspections.items.map((insp) => (
                  <tr
                    key={insp.id}
                    className="transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
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
                        {insp.checkedBoxes} cajas · {insp.checkedUnits} u. sueltas
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
                      <p className="text-xs text-slate-800 dark:text-slate-200">
                        {insp.findings}
                      </p>
                      {insp.correctiveAction && (
                        <p className="mt-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
                          Acción: {insp.correctiveAction}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setDeletingInspection(insp);
                        }}
                        title="Eliminar inspección errónea"
                        aria-label="Eliminar inspección"
                        className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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

      {/* Modal Nueva Inspección */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Registrar Inspección Física"
        subtitle="Verifica fechas de vencimiento, registra hallazgos y sincroniza stock si lo deseas."
        icon={
          <ClipboardCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Buscar Lote (opcional)
              </label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={lotSearch}
                  onChange={(e) => setLotSearch(e.target.value)}
                  placeholder="Filtrar lote o SKU..."
                  className="ui-input py-1.5 pl-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Lote a Inspeccionar (opcional)
            </label>
            <select
              value={form.lotId}
              onChange={(e) => handleLotChange(e.target.value)}
              className="ui-select mt-1"
            >
              <option value="">Inspección general de área</option>
              {filteredModalLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber} — {l.product.name} ({l.product.sku})
                </option>
              ))}
            </select>
          </div>

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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
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
                min={0}
                value={form.checkedBoxes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    checkedBoxes: Number(e.target.value),
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
                value={form.checkedUnits}
                onChange={(e) =>
                  setForm({
                    ...form,
                    checkedUnits: Number(e.target.value),
                  })
                }
                className="ui-input mt-1"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
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
                Actualizar stock del lote con estas cajas y unidades verificadas
              </label>
            )}
          </div>

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
              className="ui-btn ui-btn-primary"
            >
              {submitting ? "Guardando..." : "Guardar Inspección"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Eliminar Inspección */}
      <Modal
        open={Boolean(deletingInspection)}
        onClose={() => setDeletingInspection(null)}
        title="Eliminar inspección errónea"
        icon={
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        }
        maxWidthClass="max-w-md"
        closeDisabled={deletingBusy}
      >
        {deletingInspection && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ¿Eliminar la inspección realizada por{" "}
              <strong className="text-slate-900 dark:text-slate-100">
                {deletingInspection.inspectorName}
              </strong>{" "}
              el {formatDateTimeES(deletingInspection.inspectedAt)}
              {deletingInspection.lot
                ? ` sobre el lote ${deletingInspection.lot.lotNumber} (${deletingInspection.lot.product.name})`
                : " (inspección general)"}
              ?
            </p>
            {errorMsg && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300">
                {errorMsg}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
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
          </>
        )}
      </Modal>
    </div>
  );
}
