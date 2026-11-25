"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Edit3,
  FileSpreadsheet,
  FileText,
  FilterX,
  Package,
  PackagePlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import { DaysRemainingBadge, LotStatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import {
  buildQuantityText,
  calculateUnitsFromPackaging,
  formatExpiryLabel,
} from "@/lib/packaging";

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
  _count?: { products: number };
}

interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category: string;
  brand?: string | null;
  supplier?: { id: string; name: string } | null;
  unitsPerBox: number;
  unitsPerPack: number | null;
  unitsPerDispack: number | null;
  unitsPerDisplay: number | null;
  unitsPerBag: number | null;
  unitCost: number;
  alertThresholdDays: number;
  _count?: { lots: number };
}

interface InventoryLot {
  id: string;
  lotNumber: string;
  boxes: number;
  packs: number;
  dispacks: number;
  displays: number;
  bags: number;
  looseUnits: number;
  totalUnits: number;
  quantityText: string;
  expiryDate: string;
  expiryPrecision: string;
  expiryDisplay: string | null;
  daysToExpiry: number;
  locationCode: string | null;
  status: string;
  notes: string | null;
  product: Product;
  warehouse: Warehouse;
}

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
  const years = Array.from({ length: 12 }, (_, i) => String(currentYear - 1 + i));
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

export default function InventarioPage() {
  const { notify } = useToast();
  const { user, refreshAlertsCount } = useAppSession();
  const operatorName = user?.fullName || "Encargada Distrimarcas";

  const [lots, setLots] = useState<InventoryLot[]>(
    () => getCached<InventoryLot[]>("inventory:::") ?? []
  );
  const [products, setProducts] = useState<Product[]>(
    () => getCached<Product[]>("ref:products") ?? []
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(
    () => getCached<Supplier[]>("ref:suppliers") ?? []
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>(
    () => getCached<Warehouse[]>("ref:warehouses") ?? []
  );
  const [loading, setLoading] = useState(() => !getCached("inventory:::"));

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expiryWindow, setExpiryWindow] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const warehouseId = warehouses[0]?.id ?? "";

  const [showProductModal, setShowProductModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSupplierId, setCatalogSupplierId] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [lotProductSearch, setLotProductSearch] = useState("");
  const [productError, setProductError] = useState<string | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deletingProductBusy, setDeletingProductBusy] = useState(false);

  const [showLotModal, setShowLotModal] = useState(false);
  const [editingLot, setEditingLot] = useState<InventoryLot | null>(null);
  const [deletingLot, setDeletingLot] = useState<InventoryLot | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [submittingLot, setSubmittingLot] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [prodForm, setProdForm] = useState({
    sku: "",
    barcode: "",
    name: "",
    category: "Confitería y Dulces",
    brand: "",
    supplier: "",
    unitsPerBox: "24",
    unitsPerPack: "",
    unitsPerDispack: "",
    unitsPerDisplay: "",
    unitsPerBag: "",
    unitCost: "",
    alertThresholdDays: "60",
  });

  const [lotForm, setLotForm] = useState({
    productId: "",
    warehouseId: "",
    lotNumber: "",
    boxes: "",
    packs: "",
    dispacks: "",
    displays: "",
    bags: "",
    looseUnits: "",
    quantityTextOverride: "",
    expiryPrecision: "EXACTA" as "EXACTA" | "MES_ANO",
    expiryDate: "",
    expiryMonth: "",
    expiryDisplay: "",
    locationCode: "",
    notes: "",
    actor: "Encargada de Bodega",
  });

  const [editForm, setEditForm] = useState({
    boxes: "",
    packs: "",
    dispacks: "",
    displays: "",
    bags: "",
    looseUnits: "",
    quantityTextOverride: "",
    expiryPrecision: "EXACTA" as "EXACTA" | "MES_ANO",
    expiryDate: "",
    expiryMonth: "",
    expiryDisplay: "",
    locationCode: "",
    status: "ACTIVO",
    notes: "",
    actor: "Encargada de Bodega",
  });

  const toNonNegInt = (val: string | number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };

  const toNonNegNum = (val: string | number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ew = sp.get("expiryWindow");
    const st = sp.get("status");
    if (ew) setExpiryWindow(ew);
    if (st) setStatusFilter(st);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (warehouses[0]?.id || products[0]?.id) {
      setLotForm((prev) => ({
        ...prev,
        warehouseId: prev.warehouseId || warehouses[0]?.id || "",
        productId: prev.productId || products[0]?.id || "",
      }));
    }
  }, [warehouses, products]);

  const loadReferences = useCallback(async (force = false) => {
    try {
      const [prodsList, supList, whList] = await Promise.all([
        fetchWithCache<Product[]>(
          "ref:products",
          async () => {
            const res = await fetch("/api/products");
            if (!res.ok) throw new Error("No se pudieron cargar productos");
            return (await res.json()).products ?? [];
          },
          { force, ttlMs: 120_000 }
        ),
        fetchWithCache<Supplier[]>(
          "ref:suppliers",
          async () => {
            const res = await fetch("/api/suppliers");
            if (!res.ok) throw new Error("No se pudieron cargar proveedores");
            return (await res.json()).suppliers ?? [];
          },
          { force, ttlMs: 120_000 }
        ),
        fetchWithCache<Warehouse[]>(
          "ref:warehouses",
          async () => {
            const res = await fetch("/api/warehouses");
            if (!res.ok) throw new Error("No se pudieron cargar bodegas");
            return (await res.json()).warehouses ?? [];
          },
          { force, ttlMs: 120_000 }
        ),
      ]);
      setProducts(prodsList);
      setSuppliers(supList);
      setWarehouses(whList);
    } catch {
      // Mantener referencias previas si falla la red
    }
  }, []);

  const loadLots = useCallback(
    async (force = false) => {
      const cacheKey = `inventory:${debouncedSearch}:${expiryWindow}:${statusFilter}`;
      if (!getCached(cacheKey)) {
        setLoading(true);
      }
      try {
        const q = new URLSearchParams();
        if (debouncedSearch) q.set("search", debouncedSearch);
        if (expiryWindow) q.set("expiryWindow", expiryWindow);
        if (statusFilter) q.set("status", statusFilter);

        const lotsList = await fetchWithCache<InventoryLot[]>(
          cacheKey,
          async () => {
            const res = await fetch(`/api/inventory?${q.toString()}`);
            if (!res.ok) throw new Error("No se pudo cargar el inventario");
            return (await res.json()).lots ?? [];
          },
          { force, ttlMs: 15_000 }
        );
        setLots(lotsList);
      } catch {
        // Mantener lista previa si falla la consulta
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, expiryWindow, statusFilter]
  );

  useEffect(() => {
    void loadReferences(false);
  }, [loadReferences]);

  useEffect(() => {
    void loadLots(false);
  }, [loadLots]);

  const refreshAfterLotMutation = useCallback(async () => {
    invalidateCache("inventory:");
    invalidateCache("dashboard:");
    invalidateCache("alerts:");
    invalidateCache("ref:products");
    await Promise.all([loadLots(true), refreshAlertsCount()]);
    void loadReferences(true);
  }, [loadLots, loadReferences, refreshAlertsCount]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!prodForm.sku.trim() || !prodForm.name.trim()) {
      setErrorMsg("Código (SKU) y Nombre del producto son obligatorios.");
      return;
    }
    const unitsPerBox = toNonNegInt(prodForm.unitsPerBox);
    if (unitsPerBox < 1) {
      setErrorMsg("Las unidades por caja (Unid/CJ) deben ser al menos 1.");
      return;
    }
    setSubmittingProduct(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...prodForm,
          unitsPerBox,
          unitCost: toNonNegNum(prodForm.unitCost),
          alertThresholdDays: Math.max(
            1,
            toNonNegInt(prodForm.alertThresholdDays || "60")
          ),
          actor: operatorName,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "Error al crear producto";
        setErrorMsg(msg);
        notify({ title: "No se pudo crear producto", description: msg, variant: "error" });
        return;
      }
      const createdName = prodForm.name;
      setShowProductModal(false);
      setProdForm({
        sku: "",
        barcode: "",
        name: "",
        category: "Confitería y Dulces",
        brand: "",
        supplier: "",
        unitsPerBox: "24",
        unitsPerPack: "",
        unitsPerDispack: "",
        unitsPerDisplay: "",
        unitsPerBag: "",
        unitCost: "",
        alertThresholdDays: "60",
      });
      notify({
        title: "Producto agregado al catálogo",
        description: createdName,
        variant: "success",
      });
      invalidateCache("ref:products");
      invalidateCache("ref:suppliers");
      await loadReferences(true);
    } catch {
      const msg = "Error de conexión al guardar el producto.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const resolvedWarehouseId = lotForm.warehouseId || warehouses[0]?.id || "";
    if (!lotForm.productId) {
      setErrorMsg("Selecciona un producto del catálogo.");
      return;
    }
    if (!lotForm.lotNumber.trim()) {
      setErrorMsg("Ingresa el número de lote.");
      return;
    }
    if (lotForm.expiryPrecision === "EXACTA" && !lotForm.expiryDate) {
      setErrorMsg("Selecciona la fecha de vencimiento exacta.");
      return;
    }
    if (lotForm.expiryPrecision === "MES_ANO" && !lotForm.expiryMonth) {
      setErrorMsg("Selecciona el mes y año de vencimiento.");
      return;
    }
    setSubmittingLot(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lotForm,
          warehouseId: resolvedWarehouseId,
          boxes: toNonNegInt(lotForm.boxes),
          packs: toNonNegInt(lotForm.packs),
          dispacks: toNonNegInt(lotForm.dispacks),
          displays: toNonNegInt(lotForm.displays),
          bags: toNonNegInt(lotForm.bags),
          looseUnits: toNonNegInt(lotForm.looseUnits),
          quantityText: lotForm.quantityTextOverride.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "Error al registrar lote";
        setErrorMsg(msg);
        notify({ title: "No se pudo guardar el lote", description: msg, variant: "error" });
        return;
      }
      const createdLotNum = lotForm.lotNumber.trim();
      setShowLotModal(false);
      setLotProductSearch("");
      setLotForm({
        productId: products[0]?.id ?? "",
        warehouseId: warehouses[0]?.id ?? "",
        lotNumber: "",
        boxes: "",
        packs: "",
        dispacks: "",
        displays: "",
        bags: "",
        looseUnits: "",
        quantityTextOverride: "",
        expiryPrecision: "EXACTA",
        expiryDate: "",
        expiryMonth: "",
        expiryDisplay: "",
        locationCode: "",
        notes: "",
        actor: operatorName,
      });
      notify({
        title: "Lote registrado en inventario",
        description: `Lote ${createdLotNum.toUpperCase()} guardado y analizado.`,
        variant: "success",
      });
      await refreshAfterLotMutation();
    } catch {
      const msg = "Error de conexión al guardar el lote.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setSubmittingLot(false);
    }
  };

  const openEditModal = (lot: InventoryLot) => {
    setErrorMsg(null);
    setEditingLot(lot);
    const isoDate = lot.expiryDate.slice(0, 10);
    const isoMonth = lot.expiryDate.slice(0, 7);
    const numStr = (n: number) => (n > 0 ? String(n) : "");
    setEditForm({
      boxes: numStr(lot.boxes),
      packs: numStr(lot.packs),
      dispacks: numStr(lot.dispacks),
      displays: numStr(lot.displays),
      bags: numStr(lot.bags),
      looseUnits: numStr(lot.looseUnits),
      quantityTextOverride: "",
      expiryPrecision:
        lot.expiryPrecision === "MES_ANO" ? "MES_ANO" : "EXACTA",
      expiryDate: isoDate,
      expiryMonth: isoMonth,
      expiryDisplay: lot.expiryDisplay ?? "",
      locationCode: lot.locationCode ?? "",
      status: lot.status === "CUARENTENA" ? "CUARENTENA" : "ACTIVO",
      notes: lot.notes ?? "",
      actor: operatorName,
    });
  };

  const handleUpdateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLot) return;
    setErrorMsg(null);
    if (editForm.expiryPrecision === "EXACTA" && !editForm.expiryDate) {
      setErrorMsg("Selecciona la fecha de vencimiento exacta.");
      return;
    }
    if (editForm.expiryPrecision === "MES_ANO" && !editForm.expiryMonth) {
      setErrorMsg("Selecciona el mes y año de vencimiento.");
      return;
    }
    setSubmittingEdit(true);
    try {
      const res = await fetch(`/api/inventory/${editingLot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          boxes: toNonNegInt(editForm.boxes),
          packs: toNonNegInt(editForm.packs),
          dispacks: toNonNegInt(editForm.dispacks),
          displays: toNonNegInt(editForm.displays),
          bags: toNonNegInt(editForm.bags),
          looseUnits: toNonNegInt(editForm.looseUnits),
          quantityText: editForm.quantityTextOverride.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "No se pudo actualizar el lote";
        setErrorMsg(msg);
        notify({ title: "Error al actualizar lote", description: msg, variant: "error" });
        return;
      }
      const lotNum = editingLot.lotNumber;
      setEditingLot(null);
      notify({
        title: "Lote actualizado",
        description: `Se guardaron los cambios del lote ${lotNum}.`,
        variant: "success",
      });
      await refreshAfterLotMutation();
    } catch {
      const msg = "Error de conexión al actualizar el lote.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleConfirmDeleteLot = async () => {
    if (!deletingLot) return;
    setDeletingBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/inventory/${deletingLot.id}?actor=${encodeURIComponent(
          operatorName
        )}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "No se pudo eliminar el lote";
        setErrorMsg(msg);
        notify({ title: "Error al eliminar", description: msg, variant: "error" });
      } else {
        const lotNum = deletingLot.lotNumber;
        setDeletingLot(null);
        notify({
          title: "Lote eliminado",
          description: `El lote ${lotNum} fue retirado del inventario.`,
          variant: "info",
        });
        await refreshAfterLotMutation();
      }
    } catch {
      const msg = "Error de conexión al eliminar el lote.";
      setErrorMsg(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleConfirmDeleteProduct = async () => {
    if (!deletingProduct) return;
    setDeletingProductBusy(true);
    setProductError(null);
    try {
      const res = await fetch(
        `/api/products/${deletingProduct.id}?actor=${encodeURIComponent(
          operatorName
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "No se pudo eliminar el producto";
        setProductError(msg);
        notify({ title: "No se pudo eliminar", description: msg, variant: "error" });
        setDeletingProduct(null);
        return;
      }
      const deletedName = deletingProduct.name;
      setDeletingProduct(null);
      notify({
        title: "Producto eliminado del catálogo",
        description: deletedName,
        variant: "info",
      });
      invalidateCache("ref:products");
      invalidateCache("ref:suppliers");
      await loadReferences(true);
    } catch {
      const msg = "Error de conexión al eliminar el producto.";
      setProductError(msg);
      notify({ title: "Error de conexión", description: msg, variant: "error" });
      setDeletingProduct(null);
    } finally {
      setDeletingProductBusy(false);
    }
  };

  const hasActiveFilters = Boolean(search || expiryWindow || statusFilter);
  const clearFilters = () => {
    setSearch("");
    setExpiryWindow("");
    setStatusFilter("");
    setPage(1);
  };

  const pagedLots = paginateItems(lots, page, pageSize);
  const filteredCatalogProducts = products.filter((p) => {
    if (catalogSupplierId && p.supplier?.id !== catalogSupplierId) return false;
    if (!catalogSearch.trim()) return true;
    return `${p.sku} ${p.barcode ?? ""} ${p.name} ${p.category} ${p.brand ?? ""} ${p.supplier?.name ?? ""}`
      .toLowerCase()
      .includes(catalogSearch.trim().toLowerCase());
  });
  const pagedCatalog = paginateItems(filteredCatalogProducts, catalogPage, 10);

  const filteredLotProducts = lotProductSearch.trim()
    ? products.filter((p) =>
        `${p.sku} ${p.barcode ?? ""} ${p.name} ${p.supplier?.name ?? ""}`
          .toLowerCase()
          .includes(lotProductSearch.trim().toLowerCase())
      )
    : products;

  const selectedProductForLot = products.find(
    (p) => p.id === lotForm.productId
  );
  const visibleLotProductOptions = (() => {
    const sliced = filteredLotProducts.slice(0, 150);
    if (
      selectedProductForLot &&
      filteredLotProducts.some((p) => p.id === selectedProductForLot.id) &&
      !sliced.some((p) => p.id === selectedProductForLot.id)
    ) {
      return [selectedProductForLot, ...sliced];
    }
    return sliced;
  })();

  const lotCountsNumeric = {
    boxes: toNonNegInt(lotForm.boxes),
    packs: toNonNegInt(lotForm.packs),
    dispacks: toNonNegInt(lotForm.dispacks),
    displays: toNonNegInt(lotForm.displays),
    bags: toNonNegInt(lotForm.bags),
    looseUnits: toNonNegInt(lotForm.looseUnits),
  };
  const previewLotText = buildQuantityText(
    lotCountsNumeric,
    selectedProductForLot
  );
  const previewLotUnits = selectedProductForLot
    ? calculateUnitsFromPackaging(lotCountsNumeric, selectedProductForLot)
    : 0;

  const editCountsNumeric = {
    boxes: toNonNegInt(editForm.boxes),
    packs: toNonNegInt(editForm.packs),
    dispacks: toNonNegInt(editForm.dispacks),
    displays: toNonNegInt(editForm.displays),
    bags: toNonNegInt(editForm.bags),
    looseUnits: toNonNegInt(editForm.looseUnits),
  };
  const previewEditText = editingLot
    ? buildQuantityText(editCountsNumeric, editingLot.product)
    : "";
  const previewEditUnits = editingLot
    ? calculateUnitsFromPackaging(editCountsNumeric, editingLot.product)
    : 0;

  const openNewLotModal = () => {
    setErrorMsg(null);
    setLotProductSearch("");
    setLotForm((prev) => ({
      ...prev,
      productId: prev.productId || products[0]?.id || "",
      warehouseId: warehouses[0]?.id ?? warehouseId,
      actor: operatorName,
    }));
    setShowLotModal(true);
    if (warehouses.length === 0 || products.length === 0) {
      void loadReferences(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Inventario Corta Fecha por Lote
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Control por Código (SKU), Producto, Cantidad multi-empaque (CJ, PC,
            DPL, DISP, BL, UN), Fecha de vencimiento y Lote.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={openNewLotModal}
            className="ui-btn ui-btn-primary w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Registrar Lote
          </button>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <button
              type="button"
              onClick={() => {
                setProductError(null);
                setCatalogPage(1);
                setShowCatalogModal(true);
              }}
              className="ui-btn ui-btn-secondary"
            >
              <Package className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="truncate">Catálogo ({products.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setShowProductModal(true);
              }}
              className="ui-btn ui-btn-secondary"
            >
              <PackagePlus className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="truncate">Nuevo Producto</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900 sm:flex sm:flex-wrap sm:items-center">
            <a
              href={`/api/reports/export?type=corta_fecha${
                warehouseId ? `&warehouseId=${warehouseId}` : ""
              }`}
              className="ui-btn ui-btn-emerald-soft border-0 px-2 py-2 text-xs sm:px-2.5 sm:py-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Excel</span>
            </a>
            <a
              href={`/api/reports/export?type=corta_fecha&format=pdf${
                warehouseId ? `&warehouseId=${warehouseId}` : ""
              }`}
              className="ui-btn ui-btn-rose-soft border-0 px-2 py-2 text-xs sm:px-2.5 sm:py-1.5"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">PDF</span>
            </a>
            <a
              href={`/api/reports/export?type=general${
                warehouseId ? `&warehouseId=${warehouseId}` : ""
              }`}
              className="ui-btn ui-btn-emerald px-2 py-2 text-xs sm:px-2.5 sm:py-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Completo</span>
            </a>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="ui-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar SKU, producto, proveedor o lote..."
              className="ui-input pl-9"
            />
          </div>

          <select
            value={expiryWindow}
            onChange={(e) => {
              setExpiryWindow(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por ventana de vencimiento"
            className="ui-select"
          >
            <option value="">Cualquier fecha de vencimiento</option>
            <option value="expired">Ya vencidos</option>
            <option value="critical">Vencidos y ≤ 15 días (Crítico)</option>
            <option value="15">Vencen en ≤ 15 días</option>
            <option value="30">Vencen en ≤ 30 días</option>
            <option value="60">Vencen en ≤ 60 días</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por estado de lote"
            className="ui-select"
          >
            <option value="">Todos los estados</option>
            <option value="VENCIDO">Vencido</option>
            <option value="CRITICO">Crítico</option>
            <option value="PROXIMO_VENCER">Próximo a vencer</option>
            <option value="CUARENTENA">En cuarentena</option>
            <option value="ACTIVO">Vigente</option>
            <option value="AGOTADO">Agotado</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="tabular-nums">
            <strong className="text-slate-800 dark:text-slate-200">
              {lots.length}
            </strong>{" "}
            lote(s) encontrados (orden FEFO)
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
            >
              <FilterX className="h-3.5 w-3.5" />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Vista móvil/tablet en tarjetas */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando inventario...
          </div>
        ) : lots.length === 0 ? (
          <div className="ui-card p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              No se encontraron lotes con los filtros aplicados.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ui-btn ui-btn-secondary text-xs"
                >
                  Limpiar filtros
                </button>
              )}
              <button
                type="button"
                onClick={openNewLotModal}
                className="ui-btn ui-btn-primary text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Registrar Lote
              </button>
            </div>
          </div>
        ) : (
          pagedLots.items.map((lot) => (
            <div key={lot.id} className="ui-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                    {lot.product.sku} · Lote {lot.lotNumber}
                  </p>
                  <p className="mt-0.5 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lot.product.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lot.warehouse.name}
                    {lot.locationCode ? ` · ${lot.locationCode}` : ""}
                  </p>
                </div>
                <LotStatusBadge status={lot.status} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {lot.quantityText}
                  </p>
                  {lot.totalUnits > 0 && (
                    <p className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                      {lot.totalUnits} u. equivalentes
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                    {formatExpiryLabel(
                      lot.expiryDate,
                      lot.expiryPrecision,
                      lot.expiryDisplay
                    )}
                  </span>
                  <DaysRemainingBadge days={lot.daysToExpiry} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(lot)}
                  className="ui-btn ui-btn-secondary py-2 text-xs"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setDeletingLot(lot);
                  }}
                  className="ui-btn border border-red-200 bg-red-50 py-2 text-xs text-red-700 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950"
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
      <div className="ui-card hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto / Bodega</th>
                <th className="px-4 py-3">Cantidad (Bodega)</th>
                <th className="px-4 py-3">Fecha Vencimiento</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Estado</th>
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
                    Cargando inventario...
                  </td>
                </tr>
              ) : lots.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    <p>No se encontraron lotes con los filtros aplicados.</p>
                    <div className="mt-3 flex justify-center gap-2">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="ui-btn ui-btn-secondary text-xs"
                        >
                          Limpiar filtros
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={openNewLotModal}
                        className="ui-btn ui-btn-primary text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar Lote
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedLots.items.map((lot) => (
                  <tr
                    key={lot.id}
                    className="transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                      {lot.product.sku}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {lot.product.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {lot.warehouse.name}
                        {lot.locationCode ? ` · ${lot.locationCode}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {lot.quantityText}
                      </p>
                      {lot.totalUnits > 0 && (
                        <p className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                          {lot.totalUnits} u. equivalentes
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className="tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200">
                          {formatExpiryLabel(
                            lot.expiryDate,
                            lot.expiryPrecision,
                            lot.expiryDisplay
                          )}
                          {lot.expiryPrecision === "MES_ANO" && (
                            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              Mes/Año
                            </span>
                          )}
                        </span>
                        <DaysRemainingBadge days={lot.daysToExpiry} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {lot.lotNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <LotStatusBadge status={lot.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(lot)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300"
                          title="Ajustar conteo o editar lote"
                          aria-label={`Editar lote ${lot.lotNumber}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg(null);
                            setDeletingLot(lot);
                          }}
                          className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/60"
                          title="Eliminar lote"
                          aria-label={`Eliminar lote ${lot.lotNumber}`}
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
        currentPage={pagedLots.safePage}
        totalItems={pagedLots.totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        itemLabel="lotes"
      />

      {/* Modal Nuevo Producto */}
      <Modal
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        title="Registrar Nuevo Producto"
        subtitle="Define SKU, proveedor, equivalencias de empaque y umbral de alerta."
        icon={
          <PackagePlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        }
        maxWidthClass="max-w-xl"
        closeDisabled={submittingProduct}
        error={errorMsg}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setShowProductModal(false)}
              disabled={submittingProduct}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="product-create-form"
              disabled={submittingProduct}
              className="ui-btn ui-btn-primary"
            >
              {submittingProduct ? "Guardando..." : "Guardar Producto"}
            </button>
          </div>
        }
      >
        <form id="product-create-form" noValidate onSubmit={handleCreateProduct} className="space-y-4">
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
                className="ui-input mt-1"
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
                className="ui-input mt-1"
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

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Equivalencias de Empaque en Unidades (opcional excepto Caja)
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
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
                    setProdForm({
                      ...prodForm,
                      unitsPerBox: e.target.value,
                    })
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
                  placeholder="Ej: 36"
                  value={prodForm.unitsPerPack}
                  onChange={(e) =>
                    setProdForm({
                      ...prodForm,
                      unitsPerPack: e.target.value,
                    })
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
                  placeholder="Ej: 12"
                  value={prodForm.unitsPerDispack}
                  onChange={(e) =>
                    setProdForm({
                      ...prodForm,
                      unitsPerDispack: e.target.value,
                    })
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
                  placeholder="Ej: 18"
                  value={prodForm.unitsPerDisplay}
                  onChange={(e) =>
                    setProdForm({
                      ...prodForm,
                      unitsPerDisplay: e.target.value,
                    })
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
                  placeholder="Ej: 12"
                  value={prodForm.unitsPerBag}
                  onChange={(e) =>
                    setProdForm({
                      ...prodForm,
                      unitsPerBag: e.target.value,
                    })
                  }
                  className="ui-input mt-1 px-2 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>

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
                  setProdForm({
                    ...prodForm,
                    unitCost: e.target.value,
                  })
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
        </form>
      </Modal>

      {/* Modal Nuevo Lote */}
      <Modal
        open={showLotModal}
        onClose={() => setShowLotModal(false)}
        title="Registrar Producto en Corta Fecha / Lote"
        subtitle="Ingresa conteo físico multi-empaque y fecha exacta o Mes/Año."
        icon={<Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
        maxWidthClass="max-w-xl"
        closeDisabled={submittingLot}
        error={errorMsg}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setShowLotModal(false)}
              disabled={submittingLot}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="lot-create-form"
              disabled={submittingLot}
              className="ui-btn ui-btn-primary"
            >
              {submittingLot ? "Registrando..." : "Registrar Lote"}
            </button>
          </div>
        }
      >
        <form id="lot-create-form" noValidate onSubmit={handleCreateLot} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Producto (Código SKU — Descripción) *
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={lotProductSearch}
                onChange={(e) => {
                  const q = e.target.value;
                  setLotProductSearch(q);
                  const matches = q.trim()
                    ? products.filter((p) =>
                        `${p.sku} ${p.barcode ?? ""} ${p.name} ${p.supplier?.name ?? ""}`
                          .toLowerCase()
                          .includes(q.trim().toLowerCase())
                      )
                    : products;
                  if (
                    matches.length > 0 &&
                    !matches.some((m) => m.id === lotForm.productId)
                  ) {
                    setLotForm({ ...lotForm, productId: matches[0].id });
                  } else if (matches.length === 0) {
                    setLotForm({ ...lotForm, productId: "" });
                  }
                }}
                placeholder="Filtrar por SKU, código de barras, nombre o proveedor..."
                className="ui-input py-1.5 pl-8 text-xs"
              />
            </div>
            <select
              required
              value={lotForm.productId}
              onChange={(e) =>
                setLotForm({ ...lotForm, productId: e.target.value })
              }
              className="ui-select mt-1.5"
            >
              <option value="">Seleccione un producto...</option>
              {visibleLotProductOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                  {p.supplier ? ` (${p.supplier.name})` : ""}
                </option>
              ))}
            </select>
            {filteredLotProducts.length > 150 && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Mostrando primeros 150 de {filteredLotProducts.length} productos.
                Usa el buscador superior para filtrar rápido por SKU o nombre.
              </p>
            )}
            {selectedProductForLot && (
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Equivalencias configuradas: 1 CJ ={" "}
                <strong>{selectedProductForLot.unitsPerBox} u.</strong>
                {selectedProductForLot.unitsPerPack
                  ? ` · 1 PC = ${selectedProductForLot.unitsPerPack} u.`
                  : ""}
                {selectedProductForLot.unitsPerDispack
                  ? ` · 1 DPL = ${selectedProductForLot.unitsPerDispack} u.`
                  : ""}
                {selectedProductForLot.unitsPerDisplay
                  ? ` · 1 DISP = ${selectedProductForLot.unitsPerDisplay} u.`
                  : ""}
                {selectedProductForLot.unitsPerBag
                  ? ` · 1 BL = ${selectedProductForLot.unitsPerBag} u.`
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

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Conteo Físico por Tipo de Empaque
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Cajas (CJ)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm.boxes}
                  onChange={(e) =>
                    setLotForm({ ...lotForm, boxes: e.target.value })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Pacas (PC)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm.packs}
                  onChange={(e) =>
                    setLotForm({ ...lotForm, packs: e.target.value })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Dispack (DPL)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm.dispacks}
                  onChange={(e) =>
                    setLotForm({
                      ...lotForm,
                      dispacks: e.target.value,
                    })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Display (DISP)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm.displays}
                  onChange={(e) =>
                    setLotForm({
                      ...lotForm,
                      displays: e.target.value,
                    })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Bolsas (BL)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm.bags}
                  onChange={(e) =>
                    setLotForm({ ...lotForm, bags: e.target.value })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Unid. (UN)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={lotForm.looseUnits}
                  onChange={(e) =>
                    setLotForm({
                      ...lotForm,
                      looseUnits: e.target.value,
                    })
                  }
                  className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200">
              <span>
                Formato planilla: <strong>{previewLotText}</strong>
              </span>
              {previewLotUnits > 0 && (
                <span className="tabular-nums">
                  Equivalente: <strong>{previewLotUnits} UN</strong>
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Fecha de Vencimiento *
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
                  Solo Mes / Año (ej. Nov-26)
                </label>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    Mes y Año * (toma último día del mes)
                  </label>
                  <MonthYearSelect
                    value={lotForm.expiryMonth}
                    onChange={(next) =>
                      setLotForm({
                        ...lotForm,
                        expiryMonth: next,
                      })
                    }
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Etiqueta impresa opcional (ej. 11/2026)
                </label>
                <input
                  value={lotForm.expiryDisplay}
                  onChange={(e) =>
                    setLotForm({
                      ...lotForm,
                      expiryDisplay: e.target.value,
                    })
                  }
                  placeholder="Se genera automático si se deja vacío"
                  className="ui-input mt-1"
                />
              </div>
            </div>
          </div>

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
        </form>
      </Modal>

      {/* Modal Editar Lote */}
      <Modal
        open={Boolean(editingLot)}
        onClose={() => setEditingLot(null)}
        title={editingLot ? `Ajustar Lote ${editingLot.lotNumber}` : ""}
        subtitle={
          editingLot
            ? `${editingLot.product.sku} — ${editingLot.product.name}`
            : undefined
        }
        icon={<Edit3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
        maxWidthClass="max-w-xl"
        closeDisabled={submittingEdit}
        error={errorMsg}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setEditingLot(null)}
              disabled={submittingEdit}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="lot-edit-form"
              disabled={submittingEdit}
              className="ui-btn ui-btn-primary"
            >
              {submittingEdit ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        }
      >
        {editingLot && (
          <form id="lot-edit-form" noValidate onSubmit={handleUpdateLot} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Conteo Actualizado
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Cajas (CJ)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={editForm.boxes}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          boxes: e.target.value,
                        })
                      }
                      className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Pacas (PC)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={editForm.packs}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          packs: e.target.value,
                        })
                      }
                      className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Dispack (DPL)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={editForm.dispacks}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          dispacks: e.target.value,
                        })
                      }
                      className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Display (DISP)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={editForm.displays}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          displays: e.target.value,
                        })
                      }
                      className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Bolsas (BL)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={editForm.bags}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          bags: e.target.value,
                        })
                      }
                      className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Unid. (UN)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={editForm.looseUnits}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          looseUnits: e.target.value,
                        })
                      }
                      className="ui-input mt-1 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200">
                  <span>
                    Resultado: <strong>{previewEditText}</strong>
                  </span>
                  {previewEditUnits > 0 && (
                    <span className="tabular-nums">
                      <strong>{previewEditUnits} UN</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Fecha de Vencimiento
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
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      setEditForm({
                        ...editForm,
                        expiryDisplay: e.target.value,
                      })
                    }
                    placeholder="Etiqueta automática (ej. Nov-26)"
                    className="ui-input"
                  />
                </div>
              </div>

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
          </form>
        )}
      </Modal>

      {/* Modal Eliminar Lote */}
      <Modal
        open={Boolean(deletingLot)}
        onClose={() => setDeletingLot(null)}
        title="Eliminar lote del inventario"
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
              onClick={() => setDeletingLot(null)}
              disabled={deletingBusy}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteLot}
              disabled={deletingBusy}
              className="ui-btn ui-btn-danger"
            >
              {deletingBusy ? "Eliminando..." : "Eliminar lote"}
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

      {/* Modal Catálogo de Productos */}
      <Modal
        open={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        title={`Catálogo de Productos (${products.length})`}
        subtitle="Consulta productos y proveedores registrados o depura registros sin lotes ni averías."
        icon={
          <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        }
        maxWidthClass="max-w-5xl"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
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

          {/* Vista móvil del catálogo en tarjetas */}
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
                      onClick={() => {
                        setProductError(null);
                        setDeletingProduct(prod);
                      }}
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

          {/* Vista escritorio del catálogo */}
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
                          onClick={() => {
                            setProductError(null);
                            setDeletingProduct(prod);
                          }}
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

      {/* Modal Confirmación Eliminar Producto */}
      <Modal
        open={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
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
              onClick={() => setDeletingProduct(null)}
              disabled={deletingProductBusy}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteProduct}
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
    </div>
  );
}
