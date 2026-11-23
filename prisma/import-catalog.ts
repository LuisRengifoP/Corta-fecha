import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export interface CatalogEntry {
  sku: string;
  barcode: string | null;
  name: string;
  supplier: string;
  category: string;
  brand: string | null;
  unitsPerBox: number;
  unitCost: number;
}

export async function importCatalog(
  prisma: PrismaClient,
  options?: { logActivity?: boolean }
) {
  const dataPath = path.resolve(process.cwd(), "prisma/catalog-data.json");
  const items: CatalogEntry[] = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const supplierNames = Array.from(new Set(items.map((item) => item.supplier)));
  const supplierMap = new Map<string, string>();

  for (const name of supplierNames) {
    const supplier = await prisma.supplier.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    supplierMap.set(name, supplier.id);
  }

  let createdCount = 0;
  let updatedCount = 0;

  const existingProducts = await prisma.product.findMany({
    select: { sku: true },
  });
  const existingSkuSet = new Set(existingProducts.map((p) => p.sku));

  const BATCH_SIZE = 100;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((item) => {
        const supplierId = supplierMap.get(item.supplier) ?? null;
        if (existingSkuSet.has(item.sku)) {
          updatedCount++;
        } else {
          createdCount++;
        }
        return prisma.product.upsert({
          where: { sku: item.sku },
          update: {
            barcode: item.barcode,
            name: item.name,
            category: item.category,
            brand: item.brand,
            supplierId,
            unitsPerBox: item.unitsPerBox,
            unitsPerPack: null,
            unitCost: item.unitCost,
          },
          create: {
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            category: item.category,
            brand: item.brand,
            supplierId,
            unitsPerBox: item.unitsPerBox,
            unitCost: item.unitCost,
            alertThresholdDays: 30,
          },
        });
      })
    );
  }

  if (options?.logActivity) {
    await prisma.activityLog.create({
      data: {
        entityType: "PRODUCTO",
        action: "IMPORTAR_CATALOGO",
        actor: "Sistema",
        summary: `Catálogo oficial cargado: ${items.length} productos y ${supplierNames.length} proveedores (${createdCount} nuevos, ${updatedCount} actualizados).`,
        details: JSON.stringify({
          totalProducts: items.length,
          suppliers: supplierNames.length,
          createdCount,
          updatedCount,
        }),
      },
    });
  }

  return {
    totalProducts: items.length,
    suppliers: supplierNames.length,
    createdCount,
    updatedCount,
  };
}

if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  const prisma = new PrismaClient();
  importCatalog(prisma, { logActivity: true })
    .then((res) => {
      console.log("Catálogo importado:", res);
    })
    .catch((err) => {
      console.error("Error importando catálogo:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
