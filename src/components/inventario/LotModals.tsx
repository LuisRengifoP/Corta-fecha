"use client";

import { AlertTriangle, Edit3, PackagePlus, Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { FormSection } from "@/components/ui/FormSection";
import {
  ComboboxOption,
  SearchableCombobox,
} from "@/components/ui/SearchableCombobox";
import {
  InventoryLot,
  Product,
  Supplier,
  Warehouse,
} from "@/components/inventario/types";

const MONTH_OPTIONS = [
  { value: "01", label: "01 - Ene" },
  { value: "02", label: "02 - Feb" },
  { value: "03", label: "03 - Mar" },
  { value: "04", label: "04 - Abr" },
  { value: "05", label: "05 - May" },
  { value: "06", label: "06 - Jun" },
  { value: "07", label: "07 - Jul" },
  { value: "08", label: "08 - Ago" },
  { value: "09", label: "09 - Sep" },
  { value: "10", label: "10 - Oct" },
  { value: "11", label: "11 - Nov" },
  { value: "12", label: "12 - Dic" },
];

function MonthYearSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) =>
    String(currentYear - 1 + i)
  );
  const [yr = "", mo = ""] = value ? value.split("-") : [];

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <select
        aria-label="Mes de vencimiento"
        value={mo}
        onChange={(e) => {
          const nextMo = e.target.value;
          const nextYr = yr || String(currentYear);
          onChange(nextMo ? `${nextYr}-${nextMo}` : "");
        }}
        className="ui-select"
      >
        <option value="">Mes...</option>
        {MONTH_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Año de vencimiento"
        value={yr}
        onChange={(e) => {
          const nextYr = e.target.value;
          const nextMo = mo || "01";
          onChange(nextYr ? `${nextYr}-${nextMo}` : "");
        }}
        className="ui-select"
      >
        <option value="">Año...</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface ProdFormState {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  supplier: string;
  unitsPerBox: string;
  unitsPerPack: string;
  unitsPerDispack: string;
  unitsPerDisplay: string;
  unitsPerBag: string;
  unitCost: string;
  alertThresholdDays: string;
}

export interface LotFormState {
  productId: string;
  warehouseId: string;
  lotNumber: string;
  boxes: string;
  packs: string;
  dispacks: string;
  displays: string;
  bags: string;
  looseUnits: string;
  quantityTextOverride: string;
  expiryPrecision: "EXACTA" | "MES_ANO";
  expiryDate: string;
  expiryMonth: string;
  expiryDisplay: string;
  locationCode: string;
  notes: string;
  actor: string;
}

export interface EditLotFormState {
  boxes: string;
  packs: string;
  dispacks: string;
  displays: string;
  bags: string;
  looseUnits: string;
  quantityTextOverride: string;
  expiryPrecision: "EXACTA" | "MES_ANO";
  expiryDate: string;
  expiryMonth: string;
  expiryDisplay: string;
  locationCode: string;
  status: string;
  notes: string;
  actor: string;
}

export function ProductCreateModal({
  open,
  onClose,
  prodForm,
  setProdForm,
  suppliers,
  submitting,
  errorMsg,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  prodForm: ProdFormState;
  setProdForm: (next: ProdFormState) => void;
  suppliers: Supplier[];
  submitting: boolean;
  errorMsg: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar Nuevo Producto"
      subtitle="Define SKU, proveedor, equivalencias de empaque y umbral de alerta."
      icon={
        <PackagePlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
      }
      maxWidthClass="max-w-xl"
      closeDisabled={submitting}
      error={errorMsg}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="ui-btn ui-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="product-create-form"
            disabled={submitting}
            className="ui-btn ui-btn-primary"
          >
            {submitting ? "Guardando..." : "Guardar Producto"}
          </button>
        </div>
      }
    >
      <form
        id="product-create-form"
        noValidate
        onSubmit={onSubmit}
        className="space-y-4"
      >
        <FormSection step={1} title="Identificación del Producto">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Código (SKU) *
              </label>
              <input
                required
                value={prodForm.sku}
                onChange={(e) =>
                  setProdForm({ ...prodForm, sku: e.target.value })
                }
                placeholder="Ej: N15565-1"
                className="ui-input mt-1 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Código de Barras (EAN)
              </label>
              <input
                value={prodForm.barcode}
                onChange={(e) =>
                  setProdForm({ ...prodForm, barcode: e.target.value })
                }
                placeholder="770..."
                className="ui-input mt-1 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Producto / Descripción *
            </label>
            <input
              required
              value={prodForm.name}
              onChange={(e) =>
                setProdForm({ ...prodForm, name: e.target.value })
              }
              placeholder="Ej: OFERTA 10% SALSA TOMATE 6 DPL X 12 UND X 70 GR"
              className="ui-input mt-1"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Proveedor
              </label>
              <input
                list="catalog-suppliers-datalist"
                value={prodForm.supplier}
                onChange={(e) =>
                  setProdForm({ ...prodForm, supplier: e.target.value })
                }
                placeholder="Ej: QUALA S.A."
                className="ui-input mt-1"
              />
              <datalist id="catalog-suppliers-datalist">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Categoría
              </label>
              <input
                value={prodForm.category}
                onChange={(e) =>
                  setProdForm({ ...prodForm, category: e.target.value })
                }
                className="ui-input mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Marca
              </label>
              <input
                value={prodForm.brand}
                onChange={(e) =>
                  setProdForm({ ...prodForm, brand: e.target.value })
                }
                className="ui-input mt-1"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          step={2}
          title="Equivalencias Multi-Empaque"
          description="Define cuántas unidades contiene cada presentación (Unid/CJ es obligatorio)."
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Unid/CJ *
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                required
                placeholder="24"
                value={prodForm.unitsPerBox}
                onChange={(e) =>
                  setProdForm({ ...prodForm, unitsPerBox: e.target.value })
                }
                className="ui-input mt-1 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Unid/PC
              </label>
              <input
                type="number"
                min={1}
                placeholder="36"
                value={prodForm.unitsPerPack}
                onChange={(e) =>
                  setProdForm({ ...prodForm, unitsPerPack: e.target.value })
                }
                className="ui-input mt-1 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Unid/DPL
              </label>
              <input
                type="number"
                min={1}
                placeholder="12"
                value={prodForm.unitsPerDispack}
                onChange={(e) =>
                  setProdForm({ ...prodForm, unitsPerDispack: e.target.value })
                }
                className="ui-input mt-1 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Unid/DISP
              </label>
              <input
                type="number"
                min={1}
                placeholder="18"
                value={prodForm.unitsPerDisplay}
                onChange={(e) =>
                  setProdForm({ ...prodForm, unitsPerDisplay: e.target.value })
                }
                className="ui-input mt-1 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Unid/BL
              </label>
              <input
                type="number"
                min={1}
                placeholder="12"
                value={prodForm.unitsPerBag}
                onChange={(e) =>
                  setProdForm({ ...prodForm, unitsPerBag: e.target.value })
                }
                className="ui-input mt-1 px-2 py-1.5 text-xs"
              />
            </div>
          </div>
        </FormSection>

        <FormSection step={3} title="Costo y Regla Preventiva">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Costo Unitario (COP)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={prodForm.unitCost}
                onChange={(e) =>
                  setProdForm({ ...prodForm, unitCost: e.target.value })
                }
                className="ui-input mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Alerta Preventiva (días)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="60"
                value={prodForm.alertThresholdDays}
                onChange={(e) =>
                  setProdForm({
                    ...prodForm,
                    alertThresholdDays: e.target.value,
                  })
                }
                className="ui-input mt-1"
              />
            </div>
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}

export function LotCreateModal({
  open,
  onClose,
  lotForm,
  setLotForm,
  products,
  warehouses,
  selectedProduct,
  previewLotText,
  previewLotUnits,
  submitting,
  errorMsg,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  lotForm: LotFormState;
  setLotForm: (next: LotFormState) => void;
  products: Product[];
  warehouses: Warehouse[];
  selectedProduct: Product | undefined;
  previewLotText: string;
  previewLotUnits: number;
  submitting: boolean;
  errorMsg: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const productOptions: ComboboxOption[] = products.map((p) => ({
    value: p.id,
    badge: p.sku,
    label: p.name,
    sublabel: [p.supplier?.name, p.category, p.barcode ? `EAN ${p.barcode}` : ""]
      .filter(Boolean)
      .join(" · "),
    searchText: `${p.sku} ${p.barcode ?? ""} ${p.name} ${p.supplier?.name ?? ""}`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar Lote en Corta Fecha"
      subtitle="Ingresa conteo físico multi-empaque y fecha exacta o Mes/Año."
      icon={<Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
      maxWidthClass="max-w-xl"
      closeDisabled={submitting}
      error={errorMsg}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="ui-btn ui-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="lot-create-form"
            disabled={submitting}
            className="ui-btn ui-btn-primary"
          >
            {submitting ? "Registrando..." : "Registrar Lote"}
          </button>
        </div>
      }
    >
      <form
        id="lot-create-form"
        noValidate
        onSubmit={onSubmit}
        className="space-y-4"
      >
        <FormSection step={1} title="Producto y Lote">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Producto (SKU / Descripción) *
            </label>
            <SearchableCombobox
              options={productOptions}
              value={lotForm.productId}
              onChange={(val) => setLotForm({ ...lotForm, productId: val })}
              placeholder="Seleccionar producto..."
              searchPlaceholder="Buscar por SKU, EAN, nombre o proveedor..."
            />
            {selectedProduct && (
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Equivalencias: 1 CJ ={" "}
                <strong>{selectedProduct.unitsPerBox} u.</strong>
                {selectedProduct.unitsPerPack
                  ? ` · 1 PC = ${selectedProduct.unitsPerPack} u.`
                  : ""}
                {selectedProduct.unitsPerDispack
                  ? ` · 1 DPL = ${selectedProduct.unitsPerDispack} u.`
                  : ""}
                {selectedProduct.unitsPerDisplay
                  ? ` · 1 DISP = ${selectedProduct.unitsPerDisplay} u.`
                  : ""}
                {selectedProduct.unitsPerBag
                  ? ` · 1 BL = ${selectedProduct.unitsPerBag} u.`
                  : ""}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bodega Asignada
              </label>
              <input
                readOnly
                value={warehouses[0]?.name || "Bodega Distrimarcas"}
                className="ui-input mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lote (ID asignado) *
              </label>
              <input
                required
                value={lotForm.lotNumber}
                onChange={(e) =>
                  setLotForm({ ...lotForm, lotNumber: e.target.value })
                }
                placeholder="Ej: 2164609"
                className="ui-input mt-1 font-mono"
              />
            </div>
          </div>
        </FormSection>

        <FormSection step={2} title="Conteo Físico por Tipo de Empaque">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(
              [
                { key: "boxes", label: "Cajas (CJ)" },
                { key: "packs", label: "Pacas (PC)" },
                { key: "dispacks", label: "Dispack (DPL)" },
                { key: "displays", label: "Display (DISP)" },
                { key: "bags", label: "Bolsas (BL)" },
                { key: "looseUnits", label: "Unid. (UN)" },
              ] as const
            ).map((field) => (
              <div key={field.key}>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {field.label}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm[field.key]}
                  onChange={(e) =>
                    setLotForm({ ...lotForm, [field.key]: e.target.value })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-200">
            <span>
              Planilla: <strong>{previewLotText}</strong>
            </span>
            {previewLotUnits > 0 && (
              <span className="tabular-nums">
                Equivalente: <strong>{previewLotUnits} UN</strong>
              </span>
            )}
          </div>
        </FormSection>

        <FormSection step={3} title="Fecha de Vencimiento">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Precisión de la etiqueta
            </span>
            <div className="flex gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="lotExpPrecision"
                  checked={lotForm.expiryPrecision === "EXACTA"}
                  onChange={() =>
                    setLotForm({ ...lotForm, expiryPrecision: "EXACTA" })
                  }
                />
                Fecha exacta
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="lotExpPrecision"
                  checked={lotForm.expiryPrecision === "MES_ANO"}
                  onChange={() =>
                    setLotForm({ ...lotForm, expiryPrecision: "MES_ANO" })
                  }
                />
                Solo Mes / Año (Nov-26)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lotForm.expiryPrecision === "EXACTA" ? (
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Día / Mes / Año *
                </label>
                <input
                  type="date"
                  required
                  value={lotForm.expiryDate}
                  onChange={(e) =>
                    setLotForm({ ...lotForm, expiryDate: e.target.value })
                  }
                  className="ui-input mt-1"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Mes y Año * (último día del mes)
                </label>
                <MonthYearSelect
                  value={lotForm.expiryMonth}
                  onChange={(next) =>
                    setLotForm({ ...lotForm, expiryMonth: next })
                  }
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Etiqueta impresa opcional
              </label>
              <input
                value={lotForm.expiryDisplay}
                onChange={(e) =>
                  setLotForm({ ...lotForm, expiryDisplay: e.target.value })
                }
                placeholder="Automática si se deja vacía"
                className="ui-input mt-1"
              />
            </div>
          </div>
        </FormSection>

        <FormSection step={4} title="Ubicación y Observaciones">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ubicación (Pasillo/Estante)
              </label>
              <input
                value={lotForm.locationCode}
                onChange={(e) =>
                  setLotForm({ ...lotForm, locationCode: e.target.value })
                }
                placeholder="Ej: P1-E2-N1"
                className="ui-input mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Responsable del Conteo
              </label>
              <input
                value={lotForm.actor}
                onChange={(e) =>
                  setLotForm({ ...lotForm, actor: e.target.value })
                }
                className="ui-input mt-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Observaciones
            </label>
            <textarea
              rows={2}
              value={lotForm.notes}
              onChange={(e) =>
                setLotForm({ ...lotForm, notes: e.target.value })
              }
              className="ui-textarea mt-1"
            />
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}

export function LotEditModal({
  editingLot,
  onClose,
  editForm,
  setEditForm,
  previewEditText,
  previewEditUnits,
  submitting,
  errorMsg,
  onSubmit,
}: {
  editingLot: InventoryLot | null;
  onClose: () => void;
  editForm: EditLotFormState;
  setEditForm: (next: EditLotFormState) => void;
  previewEditText: string;
  previewEditUnits: number;
  submitting: boolean;
  errorMsg: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Modal
      open={Boolean(editingLot)}
      onClose={onClose}
      title={editingLot ? `Ajustar Lote ${editingLot.lotNumber}` : ""}
      subtitle={
        editingLot
          ? `${editingLot.product.sku} — ${editingLot.product.name}`
          : undefined
      }
      icon={<Edit3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
      maxWidthClass="max-w-xl"
      closeDisabled={submitting}
      error={errorMsg}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="ui-btn ui-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="lot-edit-form"
            disabled={submitting}
            className="ui-btn ui-btn-primary"
          >
            {submitting ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      }
    >
      {editingLot && (
        <form
          id="lot-edit-form"
          noValidate
          onSubmit={onSubmit}
          className="space-y-4"
        >
          <FormSection step={1} title="Conteo Actualizado">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(
                [
                  { key: "boxes", label: "Cajas (CJ)" },
                  { key: "packs", label: "Pacas (PC)" },
                  { key: "dispacks", label: "Dispack (DPL)" },
                  { key: "displays", label: "Display (DISP)" },
                  { key: "bags", label: "Bolsas (BL)" },
                  { key: "looseUnits", label: "Unid. (UN)" },
                ] as const
              ).map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {field.label}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={editForm[field.key]}
                    onChange={(e) =>
                      setEditForm({ ...editForm, [field.key]: e.target.value })
                    }
                    className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-200">
              <span>
                Resultado: <strong>{previewEditText}</strong>
              </span>
              {previewEditUnits > 0 && (
                <span className="tabular-nums">
                  <strong>{previewEditUnits} UN</strong>
                </span>
              )}
            </div>
          </FormSection>

          <FormSection step={2} title="Fecha de Vencimiento">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Precisión
              </span>
              <div className="flex gap-3 text-xs text-slate-700 dark:text-slate-300">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="editExpPrecision"
                    checked={editForm.expiryPrecision === "EXACTA"}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        expiryPrecision: "EXACTA",
                        expiryDisplay: "",
                      })
                    }
                  />
                  Exacta
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="editExpPrecision"
                    checked={editForm.expiryPrecision === "MES_ANO"}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        expiryPrecision: "MES_ANO",
                        expiryDisplay: "",
                      })
                    }
                  />
                  Mes/Año
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {editForm.expiryPrecision === "EXACTA" ? (
                <input
                  type="date"
                  required
                  value={editForm.expiryDate}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      expiryDate: e.target.value,
                      expiryDisplay: "",
                    })
                  }
                  className="ui-input"
                />
              ) : (
                <MonthYearSelect
                  value={editForm.expiryMonth}
                  onChange={(next) =>
                    setEditForm({
                      ...editForm,
                      expiryMonth: next,
                      expiryDisplay: "",
                    })
                  }
                />
              )}
              <input
                value={editForm.expiryDisplay}
                onChange={(e) =>
                  setEditForm({ ...editForm, expiryDisplay: e.target.value })
                }
                placeholder="Etiqueta automática (ej. Nov-26)"
                className="ui-input"
              />
            </div>
          </FormSection>

          <FormSection step={3} title="Ubicación, Estado y Notas">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ubicación
                </label>
                <input
                  value={editForm.locationCode}
                  onChange={(e) =>
                    setEditForm({ ...editForm, locationCode: e.target.value })
                  }
                  className="ui-input mt-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Estado Manual
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value })
                  }
                  className="ui-select mt-1"
                >
                  <option value="ACTIVO">Automático por vencimiento</option>
                  <option value="CUARENTENA">En cuarentena</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Notas del ajuste
              </label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
                className="ui-textarea mt-1"
              />
            </div>
          </FormSection>
        </form>
      )}
    </Modal>
  );
}

export function LotDeleteModal({
  deletingLot,
  onClose,
  onConfirm,
  busy,
  errorMsg,
}: {
  deletingLot: InventoryLot | null;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  errorMsg: string | null;
}) {
  return (
    <Modal
      open={Boolean(deletingLot)}
      onClose={onClose}
      title="Eliminar lote del inventario"
      icon={
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
      }
      maxWidthClass="max-w-md"
      closeDisabled={busy}
      error={errorMsg}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ui-btn ui-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="ui-btn ui-btn-danger"
          >
            {busy ? "Eliminando..." : "Eliminar lote"}
          </button>
        </div>
      }
    >
      {deletingLot && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Eliminar el lote{" "}
          <strong className="font-mono text-slate-900 dark:text-slate-100">
            {deletingLot.lotNumber}
          </strong>{" "}
          de{" "}
          <strong className="text-slate-900 dark:text-slate-100">
            {deletingLot.product.name}
          </strong>{" "}
          ({deletingLot.quantityText})? Esta acción también eliminará sus
          alertas y averías vinculadas.
        </p>
      )}
    </Modal>
  );
}
