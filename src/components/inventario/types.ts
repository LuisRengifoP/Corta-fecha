"use client";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
  _count?: { products: number };
}

export interface Product {
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

export interface InventoryLot {
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
  _count?: {
    inspections: number;
    damagedRecords: number;
  };
}
