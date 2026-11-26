
<img width="501" height="544" alt="image" src="https://github.com/user-attachments/assets/3d7776f6-c531-46ac-9596-e1a9ea38d123" />


# Sistema Corta Fecha — Control de Productos Próximos a Vencer y Averiados

Plataforma web full-stack desarrollada en **TypeScript (Next.js App Router + API Routes + Prisma ORM + SQLite/PostgreSQL)** para automatizar la identificación, control y seguimiento de productos próximos a vencer y averiados dentro de las bodegas de la empresa.

## Funcionalidades Principales

- **Dashboard de Indicadores (`/`)**: Semáforo de vencimientos por rangos (`Vencidos`, `0-15d`, `16-30d`, `31-60d`, `>60d`), exposición por categoría, estado por bodega, listado de lotes prioritarios bajo criterio FEFO y actividad reciente.
- **Inventario por Producto y Lote (`/inventario`)**: Registro de catálogo de productos (SKU, código de barras, unidades por caja, costo unitario, umbral de alerta) y lotes por bodega con conteo automático en cajas + unidades sueltas = total de unidades.
- **Alertas Automáticas (`/alertas`)**: Motor de análisis (`POST /api/alerts`) que evalúa fechas de vencimiento y stock, genera alertas preventivas/críticas sin duplicados y permite marcarlas como atendidas con trazabilidad del responsable.
- **Inspecciones en Bodega (`/inspecciones`)**: Bitácora de verificaciones físicas por bodega o lote con opción de sincronizar automáticamente el conteo físico al inventario.
- **Gestión de Productos Averiados (`/averias`)**: Registro de averías por tipo, severidad, cajas/unidades afectadas, pérdida económica estimada, descuento automático del stock disponible, envío a cuarentena y seguimiento de resolución (`Pendiente` → `En gestión` → `Resuelto`).
- **Historial de Auditoría (`/historial`)**: Registro cronológico de eventos en todos los módulos del sistema.
- **Reportes Exportables a Excel (`/reportes`)**: Descarga directa de archivos `.xlsx` nativos con formato mediante `ExcelJS` (`GET /api/reports/export`), incluyendo libro multi-hoja general, próximos a vencer configurables, productos averiados, inspecciones y auditoría.

## Arquitectura y Base de Datos

- **Frontend y API Backend**: Next.js 15 (App Router, React 19, Tailwind CSS v4, Lucide Icons).
- **ORM y Base de Datos**: Prisma ORM con SQLite local (`prisma/dev.db`) listo para usar. Para migrar a PostgreSQL en producción, cambie `provider = "postgresql"` y `DATABASE_URL` en `prisma/schema.prisma` y `.env`.

## Puesta en Marcha Local

```bash
# 1. Instalar dependencias
npm install

# 2. Generar cliente Prisma y crear base de datos limpia
npm run db:setup

# 3. Iniciar servidor de desarrollo
npm run dev
```

Luego abra `http://localhost:3000` en su navegador.
