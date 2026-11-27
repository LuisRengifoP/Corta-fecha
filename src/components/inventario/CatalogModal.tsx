"use client";

import { useState } from "react";
import { AlertTriangle, Package, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import { Product, Supplier } from "@/components/inventario/types";

interface CatalogModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
  productError: string | null;
  onRequestDeleteProduct: (prod: Product) => void;
  deletingProduct: Product | null;
  onCancelDeleteProduct: () => void;
  onConfirmDeleteProduct: () => void;
  deletingProductBusy: boolean;
}

export function CatalogModal({
  open,
  onClose,
  products,
  suppliers,
  productError,
  onRequestDeleteProduct,
  deletingProduct,
  onCancelDeleteProduct,
  onConfirmDeleteProduct,
  deletingProductBusy,
}: CatalogModalProps) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSupplierId, setCatalogSupplierId] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);

  const filteredCatalogProducts = products.filter((p) => {
    if (catalogSupplierId && p.supplier?.id !== catalogSupplierId) return false;
    if (!catalogSearch.trim()) return true;
    return `${p.sku} ${p.barcode ?? ""} ${p.name} ${p.category} ${p.brand ?? ""} ${p.supplier?.name ?? ""}`
      .toLowerCase()
      .includes(catalogSearch.trim().toLowerCase());
  });

  const pagedCatalog = paginateItems(filteredCatalogProducts, catalogPage, 10);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Catálogo de Productos (${products.length})`}
        subtitle="Consulta productos y proveedores registrados o depura registros sin lotes ni averías."
        icon={<Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
        maxWidthClass="max-w-5xl"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => {
                  setCatalogSearch(e.target.value);
                  setCatalogPage(1);
                }}
                placeholder="Buscar por SKU, código de barras, producto, categoría o proveedor..."
                className="ui-input pl-9"
              />
            </div>
            <select
              value={catalogSupplierId}
              onChange={(e) => {
                setCatalogSupplierId(e.target.value);
                setCatalogPage(1);
              }}
              className="ui-select"
            >
              <option value="">
                Todos los proveedores ({suppliers.length})
              </option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name} ({sup._count?.products ?? 0})
                </option>
              ))}
            </select>
          </div>

          {productError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300">
              {productError}
            </div>
          )}

          <div className="space-y-2.5 md:hidden">
            {pagedCatalog.items.length === 0 ? (
              <div className="rounded-xl border border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No hay productos que coincidan.
              </div>
            ) : (
              pagedCatalog.items.map((prod) => (
                <div
                  key={prod.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
                        {prod.sku}
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {prod.name}
                      </p>
                      {prod.barcode && (
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          EAN: {prod.barcode}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRequestDeleteProduct(prod)}
                      title="Eliminar producto del catálogo"
                      aria-label={`Eliminar producto ${prod.sku}`}
                      className="shrink-0 rounded-lg border border-red-200 bg-white p-2 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600 dark:border-slate-700/70 dark:text-slate-300">
                    <span className="truncate">
                      {prod.supplier?.name || prod.brand || prod.category}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {prod.unitsPerBox} u/CJ · $
                      {Math.round(prod.unitCost).toLocaleString("es-CO")} ·{" "}
                      {prod._count?.lots ?? 0} lote(s)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Producto</th>
                  <th className="px-3 py-2.5">Proveedor</th>
                  <th className="px-3 py-2.5">Categoría</th>
                  <th className="px-3 py-2.5 text-center">U/CJ</th>
                  <th className="px-3 py-2.5 text-right">Precio Und</th>
                  <th className="px-3 py-2.5 text-center">Lotes</th>
                  <th className="px-3 py-2.5 text-right">Eliminar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedCatalog.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No hay productos que coincidan.
                    </td>
                  </tr>
                ) : (
                  pagedCatalog.items.map((prod) => (
                    <tr
                      key={prod.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-3 py-2.5 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                        {prod.sku}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        <div>{prod.name}</div>
                        {prod.barcode && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            EAN: {prod.barcode}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {prod.supplier?.name || prod.brand || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                        {prod.category}
                      </td>
                      <td className="tabular-nums px-3 py-2.5 text-center text-slate-700 dark:text-slate-300">
                        {prod.unitsPerBox}
                      </td>
                      <td className="tabular-nums px-3 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        ${Math.round(prod.unitCost).toLocaleString("es-CO")}
                      </td>
                      <td className="tabular-nums px-3 py-2.5 text-center text-slate-600 dark:text-slate-400">
                        {prod._count?.lots ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onRequestDeleteProduct(prod)}
                          title="Eliminar producto del catálogo"
                          aria-label={`Eliminar producto ${prod.sku}`}
                          className="rounded-lg border border-red-200 p-1.5 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={pagedCatalog.safePage}
            totalItems={pagedCatalog.totalItems}
            pageSize={10}
            onPageChange={setCatalogPage}
            itemLabel="productos"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(deletingProduct)}
        onClose={onCancelDeleteProduct}
        title="Eliminar producto del catálogo"
        icon={
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        }
        maxWidthClass="max-w-md"
        closeDisabled={deletingProductBusy}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={onCancelDeleteProduct}
              disabled={deletingProductBusy}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmDeleteProduct}
              disabled={deletingProductBusy}
              className="ui-btn ui-btn-danger"
            >
              {deletingProductBusy ? "Eliminando..." : "Eliminar producto"}
            </button>
          </div>
        }
      >
        {deletingProduct && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Eliminar el producto{" "}
            <strong className="font-mono text-slate-900 dark:text-slate-100">
              {deletingProduct.sku}
            </strong>{" "}
            —{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {deletingProduct.name}
            </strong>
            ? Solo se permitirá si no tiene lotes ni averías asociadas.
          </p>
        )}
      </Modal>
    </>
  );
}
