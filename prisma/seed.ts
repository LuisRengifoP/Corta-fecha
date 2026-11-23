import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { importCatalog } from "./import-catalog";

const prisma = new PrismaClient();

/**
 * Inicializa la bodega única de Distrimarcas, la cuenta única de acceso
 * y el catálogo oficial de productos y proveedores.
 */
async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.damagedRecord.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.inventoryLot.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();

  const warehouse = await prisma.warehouse.create({
    data: {
      code: "BOD-DISTRIMARCAS",
      name: "Bodega Distrimarcas",
      location: "Sede Principal Distrimarcas",
      manager: "Encargada de Corta Fecha",
    },
  });

  const initialPassword =
    process.env.INITIAL_OPERATOR_PASSWORD || "maira123";

  const user = await prisma.user.create({
    data: {
      username: "mayra",
      fullName: "Mayra",
      role: "Encargada de Corta Fecha",
      passwordHash: hashPassword(initialPassword),
      active: true,
    },
  });

  const catalogResult = await importCatalog(prisma);

  console.log("Sistema inicializado con catálogo oficial:", {
    warehouse: warehouse.name,
    user: user.username,
    ...catalogResult,
  });
}

main()
  .catch((err) => {
    console.error("Error inicializando la base de datos:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
