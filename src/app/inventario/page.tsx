"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  Boxes,
  ClipboardCheck,
  DollarSign,
  Edit3,
  Eye,
  Package,
  PackagePlus,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Pagination, paginateItems } from "@/components/Pagination";
import { DaysRemainingBadge, LotStatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { CatalogModal } from "@/components/inventario/CatalogModal";
import { LotDetailDrawer } from "@/components/inventario/LotDetailDrawer";
import {
  EditLotFormState,
  LotCreateModal,
  LotDeleteModal,
  LotEditModal,
  LotFormState,
  ProdFormState,
  ProductCreateModal,
} from "@/components/inventario/LotModals";
import {
  InventoryLot,
  Product,
  Supplier,
  Warehouse,
} from "@/components/inventario/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import { formatCurrencyCOP } from "@/lib/constants";
import {
  buildQuantityText,
  calculateUnitsFromPackaging,
  formatExpiryLabel,
} from "@/lib/packaging";

type SortMode = "fefo" | "units_desc" | "value_desc" | "name_asc";

export default function InventarioPage() {
  const { notify } = useToast();
  const { user, warehouseName, refreshAlertsCount } = useAppSession();
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
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("fefo");
  const warehouseId = warehouses[0]?.id ?? "";

  const [detailLot, setDetailLot] = useState<InventoryLot | null>(null);
  const handledLotParamRef = useRef(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
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

  const [prodForm, setProdForm] = useState<ProdFormState>({
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

  const [lotForm, setLotForm] = useState<LotFormState>({
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
    expiryPrecision: "EXACTA",
    expiryDate: "",
    expiryMonth: "",
    expiryDisplay: "",
    locationCode: "",
    notes: "",
    actor: "Encargada de Bodega",
  });

  const [editForm, setEditForm] = useState<EditLotFormState>({
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
    }, 220);
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

  useEffect(() => {
    if (handledLotParamRef.current || lots.length === 0) return;
    const lotIdParam = new URLSearchParams(window.location.search).get("lotId");
    if (lotIdParam) {
      handledLotParamRef.current = true;
      const target = lots.find((l) => l.id === lotIdParam);
      if (target) setDetailLot(target);
    }
  }, [lots]);

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
        notify({
          title: "No se pudo crear producto",
          description: msg,
          variant: "error",
        });
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
        notify({
          title: "No se pudo guardar el lote",
          description: msg,
          variant: "error",
        });
        return;
      }
      const createdLotNum = lotForm.lotNumber.trim();
      setShowLotModal(false);
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
        notify({
          title: "Error al actualizar lote",
          description: msg,
          variant: "error",
        });
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
        notify({
          title: "No se pudo eliminar",
          description: msg,
          variant: "error",
        });
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of lots) {
      if (l.product.category) set.add(l.product.category);
    }
    return Array.from(set).sort();
  }, [lots]);

  const visibleLots = useMemo(() => {
    const filtered = categoryFilter
      ? lots.filter((l) => l.product.category === categoryFilter)
      : lots;
    const copy = [...filtered];
    if (sortMode === "units_desc") {
      copy.sort((a, b) => b.totalUnits - a.totalUnits);
    } else if (sortMode === "value_desc") {
      copy.sort(
        (a, b) =>
          b.totalUnits * b.product.unitCost - a.totalUnits * a.product.unitCost
      );
    } else if (sortMode === "name_asc") {
      copy.sort((a, b) => a.product.name.localeCompare(b.product.name, "es"));
    }
    return copy;
  }, [lots, categoryFilter, sortMode]);

  const metrics = useMemo(() => {
    let totalUnits = 0;
    let totalValue = 0;
    let criticalOrExpired = 0;
    for (const lot of visibleLots) {
      totalUnits += lot.totalUnits;
      totalValue += lot.totalUnits * lot.product.unitCost;
      if (lot.daysToExpiry <= 15 && lot.totalUnits > 0) {
        criticalOrExpired += 1;
      }
    }
    return { totalUnits, totalValue, criticalOrExpired };
  }, [visibleLots]);

  const hasActiveFilters = Boolean(
    search || expiryWindow || statusFilter || categoryFilter
  );
  const clearFilters = () => {
    setSearch("");
    setExpiryWindow("");
    setStatusFilter("");
    setCategoryFilter("");
    setPage(1);
  };

  const pagedLots = paginateItems(visibleLots, page, pageSize);

  const selectedProductForLot = products.find(
    (p) => p.id === lotForm.productId
  );

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

  const quickSegment = (() => {
    if (expiryWindow === "critical") return "critical";
    if (expiryWindow === "30") return "30";
    if (expiryWindow === "expired") return "expired";
    if (statusFilter === "CUARENTENA") return "CUARENTENA";
    if (!expiryWindow && !statusFilter) return "all";
    return "";
  })();

  const applyQuickSegment = (seg: string) => {
    setPage(1);
    if (seg === "all") {
      setExpiryWindow("");
      setStatusFilter("");
    } else if (seg === "critical" || seg === "30" || seg === "expired") {
      setExpiryWindow(seg);
      setStatusFilter("");
    } else if (seg === "CUARENTENA") {
      setExpiryWindow("");
      setStatusFilter("CUARENTENA");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario y Lotes"
        badge={warehouseName}
        description="Control multi-empaque (CJ, PC, DPL, DISP, BL, UN), orden FEFO automático y ficha técnica por lote."
        exports={[
          {
            label: "Corta Fecha",
            href: `/api/reports/export?type=corta_fecha${
              warehouseId ? `&warehouseId=${warehouseId}` : ""
            }`,
            format: "xlsx",
          },
          {
            label: "PDF",
            href: `/api/reports/export?type=corta_fecha&format=pdf${
              warehouseId ? `&warehouseId=${warehouseId}` : ""
            }`,
            format: "pdf",
          },
          {
            label: "Completo",
            href: `/api/reports/export?type=general${
              warehouseId ? `&warehouseId=${warehouseId}` : ""
            }`,
            format: "xlsx",
          },
        ]}
        secondaryActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setProductError(null);
                setShowCatalogModal(true);
              }}
              className="ui-btn ui-btn-secondary"
            >
              <Package className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>Catálogo ({products.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setShowProductModal(true);
              }}
              className="ui-btn ui-btn-secondary"
            >
              <PackagePlus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>Nuevo Producto</span>
            </button>
          </div>
        }
        primaryAction={
          <button
            type="button"
            onClick={openNewLotModal}
            className="ui-btn ui-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Registrar Lote
          </button>
        }
      />

      {/* Resumen contextual de vista */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Lotes en vista"
          value={visibleLots.length.toLocaleString("es-CO")}
          sublabel={hasActiveFilters ? "Según filtros activos" : "Total inventario"}
          icon={<Package className="h-4 w-4" />}
          tone="indigo"
        />
        <KpiCard
          label="Unidades totales"
          value={metrics.totalUnits.toLocaleString("es-CO")}
          sublabel="Equivalente en unidades (UN)"
          icon={<Boxes className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Valor en vista"
          value={formatCurrencyCOP(metrics.totalValue)}
          sublabel="Costo unitario × stock"
          icon={<DollarSign className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Críticos / Vencidos"
          value={metrics.criticalOrExpired}
          sublabel="Lotes con ≤15 días o vencidos"
          icon={<AlertOctagon className="h-4 w-4" />}
          tone="red"
          onClick={() => applyQuickSegment("critical")}
          active={quickSegment === "critical"}
        />
      </div>

      {/* Barra de búsqueda, pestañas y filtros */}
      <FilterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Buscar por SKU, EAN, producto, proveedor, ubicación o lote..."
        resultCount={visibleLots.length}
        resultLabel="lote(s) ordenados"
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        tabs={
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "all", label: "Todos" },
              { id: "critical", label: "Críticos (≤15d)" },
              { id: "30", label: "Próximos (≤30d)" },
              { id: "expired", label: "Vencidos" },
              { id: "CUARENTENA", label: "En cuarentena" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => applyQuickSegment(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  quickSegment === tab.id
                    ? "bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
        filters={
          <>
            <select
              value={expiryWindow}
              onChange={(e) => {
                setExpiryWindow(e.target.value);
                setPage(1);
              }}
              aria-label="Ventana de vencimiento"
              className="ui-select sm:w-44"
            >
              <option value="">Ventana: Todas</option>
              <option value="expired">Ya vencidos</option>
              <option value="critical">Vencidos y ≤15d</option>
              <option value="15">0 a 15 días</option>
              <option value="30">0 a 30 días</option>
              <option value="60">0 a 60 días</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Estado de lote"
              className="ui-select sm:w-40"
            >
              <option value="">Estado: Todos</option>
              <option value="VENCIDO">Vencido</option>
              <option value="CRITICO">Crítico</option>
              <option value="PROXIMO_VENCER">Próximo a vencer</option>
              <option value="CUARENTENA">En cuarentena</option>
              <option value="ACTIVO">Vigente</option>
              <option value="AGOTADO">Agotado</option>
            </select>

            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Categoría"
                className="ui-select sm:w-44"
              >
                <option value="">Categoría: Todas</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="Ordenar resultados"
              className="ui-select sm:w-40"
            >
              <option value="fefo">Orden: FEFO</option>
              <option value="units_desc">Mayor stock</option>
              <option value="value_desc">Mayor valor COP</option>
              <option value="name_asc">Producto A-Z</option>
            </select>
          </>
        }
      />

      {/* Vista móvil/tablet en tarjetas */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando inventario...
          </div>
        ) : visibleLots.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="No se encontraron lotes"
              description="Ajusta los filtros de búsqueda o registra un nuevo lote en bodega."
              action={
                <>
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
                </>
              }
            />
          </div>
        ) : (
          pagedLots.items.map((lot) => (
            <div key={lot.id} className="ui-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetailLot(lot)}
                  className="min-w-0 text-left"
                >
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
                </button>
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

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDetailLot(lot)}
                  className="ui-btn ui-btn-secondary px-2 py-1.5 text-xs"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ficha
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(lot)}
                  className="ui-btn ui-btn-secondary px-2 py-1.5 text-xs"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </button>
                <Link
                  href={`/inspecciones?lotId=${lot.id}`}
                  className="ui-btn ui-btn-secondary px-2 py-1.5 text-xs"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Inspec.
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setDeletingLot(lot);
                  }}
                  aria-label={`Eliminar lote ${lot.lotNumber}`}
                  className="ui-btn ui-btn-ghost border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
                <th className="px-4 py-3">Producto / Ubicación</th>
                <th className="px-4 py-3">Cantidad (Bodega)</th>
                <th className="px-4 py-3">Vencimiento</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones rápidas</th>
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
              ) : visibleLots.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Package className="h-6 w-6" />}
                      title="No se encontraron lotes"
                      description="Ajusta los filtros aplicados o registra un nuevo lote en bodega."
                      action={
                        <>
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
                        </>
                      }
                    />
                  </td>
                </tr>
              ) : (
                pagedLots.items.map((lot) => (
                  <tr
                    key={lot.id}
                    onClick={() => setDetailLot(lot)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                      {lot.product.sku}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {lot.product.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {lot.product.supplier?.name || lot.product.category}
                        {lot.locationCode ? ` · ${lot.locationCode}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {lot.quantityText}
                      </p>
                      {lot.totalUnits > 0 && (
                        <p className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                          {lot.totalUnits.toLocaleString("es-CO")} u. ·{" "}
                          {formatCurrencyCOP(
                            lot.totalUnits * lot.product.unitCost
                          )}
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
                    <td
                      className="px-4 py-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailLot(lot)}
                          title="Ver ficha del lote"
                          aria-label={`Ver ficha del lote ${lot.lotNumber}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/60"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(lot)}
                          title="Ajustar conteo o editar lote"
                          aria-label={`Editar lote ${lot.lotNumber}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/60"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/inspecciones?lotId=${lot.id}`}
                          title="Inspeccionar lote"
                          aria-label={`Inspeccionar lote ${lot.lotNumber}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-teal-950/50"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/averias?lotId=${lot.id}`}
                          title="Reportar avería"
                          aria-label={`Reportar avería del lote ${lot.lotNumber}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-orange-600 transition-colors hover:border-orange-300 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-800 dark:text-orange-400 dark:hover:bg-orange-950/50"
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg(null);
                            setDeletingLot(lot);
                          }}
                          title="Eliminar lote"
                          aria-label={`Eliminar lote ${lot.lotNumber}`}
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

      {/* Ficha detallada de Lote */}
      <LotDetailDrawer
        lot={detailLot}
        onClose={() => setDetailLot(null)}
        onEdit={openEditModal}
        onDelete={(lot) => {
          setErrorMsg(null);
          setDeletingLot(lot);
        }}
      />

      {/* Modales organizados por secciones */}
      <ProductCreateModal
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        prodForm={prodForm}
        setProdForm={setProdForm}
        suppliers={suppliers}
        submitting={submittingProduct}
        errorMsg={errorMsg}
        onSubmit={handleCreateProduct}
      />

      <LotCreateModal
        open={showLotModal}
        onClose={() => setShowLotModal(false)}
        lotForm={lotForm}
        setLotForm={setLotForm}
        products={products}
        warehouses={warehouses}
        selectedProduct={selectedProductForLot}
        previewLotText={previewLotText}
        previewLotUnits={previewLotUnits}
        submitting={submittingLot}
        errorMsg={errorMsg}
        onSubmit={handleCreateLot}
      />

      <LotEditModal
        editingLot={editingLot}
        onClose={() => setEditingLot(null)}
        editForm={editForm}
        setEditForm={setEditForm}
        previewEditText={previewEditText}
        previewEditUnits={previewEditUnits}
        submitting={submittingEdit}
        errorMsg={errorMsg}
        onSubmit={handleUpdateLot}
      />

      <LotDeleteModal
        deletingLot={deletingLot}
        onClose={() => setDeletingLot(null)}
        onConfirm={handleConfirmDeleteLot}
        busy={deletingBusy}
        errorMsg={errorMsg}
      />

      <CatalogModal
        open={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        products={products}
        suppliers={suppliers}
        productError={productError}
        onRequestDeleteProduct={(prod) => {
          setProductError(null);
          setDeletingProduct(prod);
        }}
        deletingProduct={deletingProduct}
        onCancelDeleteProduct={() => setDeletingProduct(null)}
        onConfirmDeleteProduct={handleConfirmDeleteProduct}
        deletingProductBusy={deletingProductBusy}
      />
    </div>
  );
}
