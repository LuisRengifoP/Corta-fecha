"use client";

import Link from "next/link";
import {
  Barcode,
  Boxes,
  Calendar,
  ClipboardCheck,
  Edit3,
  MapPin,
  Package,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { DaysRemainingBadge, LotStatusBadge } from "@/components/StatusBadge";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EntityTimeline } from "@/components/ui/EntityTimeline";
import { formatCurrencyCOP } from "@/lib/constants";
import { formatExpiryLabel } from "@/lib/packaging";
import { InventoryLot } from "@/components/inventario/types";

interface LotDetailDrawerProps {
  lot: InventoryLot | null;
  onClose: () => void;
  onEdit: (lot: InventoryLot) => void;
  onDelete: (lot: InventoryLot) => void;
}

export function LotDetailDrawer({
  lot,
  onClose,
  onEdit,
  onDelete,
}: LotDetailDrawerProps) {
  const packagingRows = lot
    ? [
        { code: "CJ", label: "Cajas", count: lot.boxes, per: lot.product.unitsPerBox },
        { code: "PC", label: "Pacas", count: lot.packs, per: lot.product.unitsPerPack },
        { code: "DPL", label: "Dispack", count: lot.dispacks, per: lot.product.unitsPerDispack },
        { code: "DISP", label: "Display", count: lot.displays, per: lot.product.unitsPerDisplay },
        { code: "BL", label: "Bolsas", count: lot.bags, per: lot.product.unitsPerBag },
        { code: "UN", label: "Sueltas", count: lot.looseUnits, per: 1 },
      ]
    : [];

  return (
    <DetailDrawer
      open={Boolean(lot)}
      onClose={onClose}
      title={lot ? `Lote ${lot.lotNumber}` : ""}
      subtitle={lot ? `${lot.product.sku} — ${lot.product.name}` : undefined}
      icon={<Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
      badge={
        lot && (
          <>
            <LotStatusBadge status={lot.status} />
            <DaysRemainingBadge days={lot.daysToExpiry} />
          </>
        )
      }
      footer={
        lot && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete(lot);
              }}
              className="ui-btn ui-btn-ghost px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/inspecciones?lotId=${lot.id}`}
                className="ui-btn ui-btn-secondary py-1.5 text-xs"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Inspeccionar
              </Link>
              <Link
                href={`/averias?lotId=${lot.id}`}
                className="ui-btn ui-btn-secondary py-1.5 text-xs text-orange-700 dark:text-orange-300"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Avería
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(lot);
                }}
                className="ui-btn ui-btn-primary py-1.5 text-xs"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Editar lote
              </button>
            </div>
          </div>
        )
      }
    >
      {lot && (
        <div className="space-y-5">
          {/* Resumen principal */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Stock Planilla
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                {lot.quantityText}
              </p>
              <p className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {lot.totalUnits.toLocaleString("es-CO")} u. equivalentes
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Valor Estimado
              </p>
              <p className="tabular-nums mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatCurrencyCOP(lot.totalUnits * lot.product.unitCost)}
              </p>
              <p className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {formatCurrencyCOP(lot.product.unitCost)} / und.
              </p>
            </div>
          </div>

          {/* Ficha técnica del producto y ubicación */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Identificación y Ubicación
            </h3>
            <dl className="grid grid-cols-2 gap-y-2.5 gap-x-3 pt-1">
              <div>
                <dt className="text-[11px] text-slate-400">Vencimiento</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span className="tabular-nums">
                    {formatExpiryLabel(
                      lot.expiryDate,
                      lot.expiryPrecision,
                      lot.expiryDisplay
                    )}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Bodega / Estante</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    {lot.warehouse.name}
                    {lot.locationCode ? ` · ${lot.locationCode}` : ""}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Proveedor</dt>
                <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                  {lot.product.supplier?.name || lot.product.brand || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Categoría</dt>
                <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                  {lot.product.category}
                </dd>
              </div>
              {lot.product.barcode && (
                <div className="col-span-2">
                  <dt className="text-[11px] text-slate-400">Código EAN</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-mono font-medium text-slate-800 dark:text-slate-200">
                    <Barcode className="h-3.5 w-3.5 text-slate-400" />
                    {lot.product.barcode}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Desglose multi-empaque */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Boxes className="h-3.5 w-3.5" />
                Conteo Multi-Empaque
              </h3>
              <span className="tabular-nums text-[11px] text-slate-400">
                Alerta preventiva: ≤{lot.product.alertThresholdDays}d
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {packagingRows.map((pkg) => (
                <div
                  key={pkg.code}
                  className={`rounded-lg border px-2.5 py-2 ${
                    pkg.count > 0
                      ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/70 dark:bg-indigo-950/35"
                      : "border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {pkg.code}
                    </span>
                    {pkg.per && pkg.code !== "UN" && (
                      <span className="tabular-nums text-[10px] text-slate-400">
                        ×{pkg.per}
                      </span>
                    )}
                  </div>
                  <p className="tabular-nums mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {pkg.count}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {lot.notes && (
            <div className="rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Observaciones
              </p>
              <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
                {lot.notes}
              </p>
            </div>
          )}

          {lot._count && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
                <span className="text-slate-500 dark:text-slate-400">
                  Inspecciones:{" "}
                </span>
                <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                  {lot._count.inspections}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
                <span className="text-slate-500 dark:text-slate-400">
                  Averías:{" "}
                </span>
                <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                  {lot._count.damagedRecords}
                </strong>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Historial de Actuaciones
            </h3>
            <EntityTimeline entityId={lot.id} />
          </div>
        </div>
      )}
    </DetailDrawer>
  );
}
