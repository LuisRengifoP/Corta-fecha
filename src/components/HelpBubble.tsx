"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  HelpCircle,
  History,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Package,
  Search,
  ShieldAlert,
  Sparkles,
  SunMoon,
  X,
} from "lucide-react";

type HelpTab = "resumen" | "modulos" | "reglas" | "faq";

interface ModuleGuide {
  id: string;
  href: string;
  title: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  whatItDoes: string;
  keyActions: string[];
  tips: string;
}

const MODULE_GUIDES: ModuleGuide[] = [
  {
    id: "dashboard",
    href: "/",
    title: "Panel Principal (Dashboard)",
    shortDesc: "Resumen ejecutivo, semáforo FEFO e indicadores en tiempo real.",
    icon: LayoutDashboard,
    badgeColor:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70",
    whatItDoes:
      "Muestra el estado general de la bodega al instante: lotes vencidos, críticos (≤15 días), preventivos (16–30 días), valor total del inventario activo, averías pendientes y alertas sin atender.",
    keyActions: [
      "Ejecutar Análisis: escanea todos los lotes, actualiza estados según la fecha de hoy y crea o cierra alertas automáticamente.",
      "Semáforo y Exposición por Categoría: permite ver qué porcentaje de cada categoría vence en ≤30 días.",
      "Tabla de Lotes Prioritarios (FEFO): lista lotes vencidos, ≤45 días o en cuarentena ordenados del más próximo a vencer al más lejano, con accesos directos a Inspeccionar o Reportar Avería.",
      "Descargas rápidas: Planilla Corta Fecha en Excel (.xlsx), Planilla PDF y Excel General Multi-Hoja.",
    ],
    tips: "Úsalo cada mañana al iniciar turno para priorizar qué mercancía debe salir primero de bodega.",
  },
  {
    id: "inventario",
    href: "/inventario",
    title: "Inventario y Lotes",
    shortDesc: "Catálogo de productos, registro de lotes multi-empaque y fechas.",
    icon: Package,
    badgeColor:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70",
    whatItDoes:
      "Es el corazón operativo del sistema. Administra el Catálogo Maestro de productos (SKU, código de barras EAN, proveedor y equivalencias de empaque) y los lotes físicos almacenados en bodega.",
    keyActions: [
      "Catálogo: consulta todos los productos registrados, filtra por proveedor o SKU y elimina productos que no tengan lotes ni averías vinculadas.",
      "Nuevo Producto: crea un SKU con sus equivalencias (Unidades por Caja CJ, Paca PC, Dispack DPL, Display DISP, Bolsa BL), costo unitario y días de alerta preventiva.",
      "Registrar Lote: asocia un producto, número de lote, conteo físico en múltiples empaques, ubicación (pasillo/estante) y fecha de vencimiento Exacta o Mes/Año.",
      "Editar / Ajustar Lote: corrige cantidades tras conteos o salidas, actualiza la fecha o pasa manualmente un lote a estado En Cuarentena.",
      "Eliminar Lote: borra registros creados por error (elimina también sus alertas y averías asociadas).",
    ],
    tips: "Si un empaque solo indica Mes/Año (ej. Nov-26), selecciona 'Solo Mes / Año': el sistema calcula el último día de ese mes para las alertas sin alterar la etiqueta impresa.",
  },
  {
    id: "alertas",
    href: "/alertas",
    title: "Alertas Automáticas y WhatsApp",
    shortDesc: "Detección de vencimientos ≤30 días y envío a WhatsApp.",
    icon: Bell,
    badgeColor:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
    whatItDoes:
      "Centraliza las alertas generadas automáticamente para lotes vencidos (severidad Alta), críticos ≤15 días (Alta) y preventivos 16–30 días (Media). Evita duplicados por lote y cierra alertas automáticamente cuando un lote se agota o entra en cuarentena.",
    keyActions: [
      "Ejecutar Escaneo Automático: recalcula estados y genera alertas nuevas; si hay API de WhatsApp configurada en .env, envía automáticamente las pendientes.",
      "Enviar Resumen por WhatsApp: agrupa todos los lotes activos con ≤30 días y los envía por API o abre el asistente de WhatsApp Web para copiar el texto y enviarlo en 1 clic.",
      "WhatsApp individual: envía una sola alerta puntual al número configurado (+57 312 638 7834 por defecto o el definido en ALERT_WHATSAPP_TO).",
      "Marcar atendida / Reabrir: registra qué responsable gestionó la alerta con fecha y hora.",
      "Accesos directos: desde cada alerta puedes saltar directo a Inspeccionar o Reportar Avería sobre ese lote.",
    ],
    tips: "Recuerda revisar tanto la pestaña 'Alertas Pendientes' como 'Atendidas / Históricas' para hacer seguimiento completo.",
  },
  {
    id: "inspecciones",
    href: "/inspecciones",
    title: "Control de Inspecciones",
    shortDesc: "Bitácora de revisiones físicas y sincronización de stock.",
    icon: ClipboardCheck,
    badgeColor:
      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/70",
    whatItDoes:
      "Documenta los recorridos y verificaciones físicas realizadas en bodega sobre un lote específico o un área general, registrando hallazgos y acciones correctivas.",
    keyActions: [
      "Nueva Inspección: registra tipo (Programada, Seguimiento de alerta, Aleatoria o Recepción en bodega), resultado (Aprobada, Con observación o Crítica), conteo verificado y hallazgos.",
      "Fecha verificada físicamente: confirma que la etiqueta del producto coincide con el sistema.",
      "Actualizar stock del lote: si marcas esta casilla al inspeccionar un lote, el inventario del lote se actualiza automáticamente con las cajas y unidades contadas.",
      "Exportar Excel: descarga la bitácora completa de inspecciones.",
    ],
    tips: "Cuando llegas desde 'Inspeccionar' en el Dashboard o Alertas, el lote y su conteo actual se pre-cargan automáticamente en el formulario.",
  },
  {
    id: "averias",
    href: "/averias",
    title: "Productos Averiados",
    shortDesc: "Novedades físicas, cálculo de pérdidas y cuarentena.",
    icon: ShieldAlert,
    badgeColor:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70",
    whatItDoes:
      "Controla productos con empaque dañado, humedad, aplastamiento, ruptura de cadena de frío, contaminación o vencimiento. Calcula el impacto económico (unidades afectadas × costo unitario) y gestiona su resolución.",
    keyActions: [
      "Reportar Avería: selecciona el lote, tipo de daño, severidad (Leve, Moderada, Pérdida total), cajas/unidades afectadas y disposición (Cuarentena, Liquidación, Devolución a proveedor, Baja/Destrucción o Reacondicionamiento).",
      "Descontar del inventario: resta automáticamente las unidades averiadas del stock disponible del lote.",
      "Bloquear lote en Cuarentena: marca todo el lote como En Cuarentena para impedir su despacho.",
      "Actualizar Gestión: cambia el estado de Pendiente → En gestión → Resuelto con notas de seguimiento.",
      "Eliminar avería errónea: permite restaurar automáticamente al lote las unidades que se habían descontado.",
    ],
    tips: "Si reportaste una avería por equivocación y ya había descontado stock, al eliminarla marca la casilla 'Restaurar unidades descontadas' para devolver el saldo al lote.",
  },
  {
    id: "historial",
    href: "/historial",
    title: "Historial de Auditoría",
    shortDesc: "Trazabilidad completa de cada movimiento y usuario.",
    icon: History,
    badgeColor:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    whatItDoes:
      "Guarda automáticamente un registro cronológico de todas las operaciones realizadas: creación/edición/eliminación de productos y lotes, inspecciones, averías, alertas, envíos de WhatsApp y descargas de reportes.",
    keyActions: [
      "Buscador y filtro por módulo: encuentra rápidamente qué responsable realizó una acción o qué ocurrió con un SKU o lote.",
      "Exportar Auditoría (.xlsx): descarga el historial completo en Excel para control interno.",
    ],
    tips: "La auditoría es de solo lectura para garantizar la integridad y trazabilidad de la bodega.",
  },
  {
    id: "reportes",
    href: "/reportes",
    title: "Centro de Reportes (Excel y PDF)",
    shortDesc: "Planillas oficiales de Distrimarcas S.A.S. listas para imprimir.",
    icon: FileSpreadsheet,
    badgeColor:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
    whatItDoes:
      "Genera documentos corporativos en Excel (.xlsx) y PDF (.pdf) con el logo oficial de Distrimarcas S.A.S. y las columnas operativas requeridas en bodega.",
    keyActions: [
      "Planilla Corta Fechas (Oficial): incluye Fecha, Proveedor y las 6 columnas oficiales (CÓDIGO, PRODUCTO, CAJAS, UNID., LOTE, FECHA VENCIMIENTO).",
      "Próximos a Vencer: filtra lotes dentro de la ventana elegida (15, 30, 60 o 90 días).",
      "Productos en Averías (Oficial): planilla imprimible de mercancía averiada.",
      "Reporte General Multi-Hoja: libro completo con Planilla Corta Fecha, Inventario Detallado por Empaque, Averías e Inspecciones.",
      "Bitácora de Inspecciones e Historial de Auditoría.",
    ],
    tips: "El campo 'Proveedor en encabezado (opcional)' permite imprimir el nombre del proveedor en la cabecera de la planilla o dejar la línea en blanco para llenarla a mano.",
  },
  {
    id: "cuenta",
    href: "#cuenta",
    title: "Acceso, Clave y Modo Claro / Oscuro",
    shortDesc: "Sesión protegida, cambio de clave y preferencia visual.",
    icon: KeyRound,
    badgeColor:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/70",
    whatItDoes:
      "El sistema protege todas las vistas y APIs mediante sesión autenticada en cookies seguras, y permite alternar entre Modo Claro y Modo Oscuro según la iluminación de bodega.",
    keyActions: [
      "Botón 'Clave' en el menú lateral: permite actualizar el nombre visible de la encargada y cambiar la contraseña (mínimo 6 caracteres).",
      "Botón 'Modo oscuro / Modo claro' en la barra superior: guarda automáticamente tu preferencia visual en el navegador.",
      "Botón 'Salir': cierra la sesión actual de forma segura y redirige al inicio de sesión.",
    ],
    tips: "Al actualizar el nombre de la encargada, las nuevas inspecciones, averías y escaneos quedarán firmados con ese nombre.",
  },
];

const PACKAGING_GLOSSARY = [
  {
    code: "CJ",
    name: "Cajas",
    desc: "Unidad de empaque master principal (Unid/CJ obligatorio en el producto).",
  },
  {
    code: "PC",
    name: "Pacas",
    desc: "Agrupación intermedia (ej. 1 paca = 36 unidades). Muestra equivalencia en planilla.",
  },
  {
    code: "DPL",
    name: "Dispack",
    desc: "Sub-empaque o paquete distribuidor configurado por producto.",
  },
  {
    code: "DISP",
    name: "Display",
    desc: "Caja exhibidora de mostrador con unidades internas.",
  },
  {
    code: "BL",
    name: "Bolsas",
    desc: "Empaque en bolsa sellada con cantidad fija de unidades.",
  },
  {
    code: "UN",
    name: "Unidades sueltas",
    desc: "Unidades individuales fuera de caja/paca; también representa el total equivalente.",
  },
];

const STATUS_GLOSSARY = [
  {
    label: "Vencido (< 0 días)",
    badge:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
    meaning:
      "La fecha de vencimiento ya pasó. Retirar de venta inmediatamente y gestionar baja o devolución.",
  },
  {
    label: "Crítico (0 – 15 días)",
    badge:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70",
    meaning:
      "Prioridad máxima de despacho FEFO, descuento comercial o liquidación urgente.",
  },
  {
    label: "Próximo a vencer (16 – 30 días)",
    badge:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
    meaning:
      "Ventana preventiva estándar. Se incluye en alertas automáticas y resúmenes de WhatsApp.",
  },
  {
    label: "Vigente (> 30 días)",
    badge:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
    meaning:
      "Stock saludable dentro de vigencia normal (en el Dashboard también se monitorea la ventana 31–60d).",
  },
  {
    label: "En cuarentena",
    badge:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/70",
    meaning:
      "Lote bloqueado manualmente o desde Averías. No genera alertas de venta hasta su resolución.",
  },
  {
    label: "Agotado (0 u.)",
    badge:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    meaning:
      "Lote sin existencias en ningún empaque. Sus alertas activas se cierran automáticamente.",
  },
];

const FAQ_ITEMS = [
  {
    q: "¿Qué significa FEFO y cómo lo aplica el sistema?",
    a: "FEFO significa 'First Expired, First Out' (Primero en Vencer, Primero en Salir). Todas las tablas de inventario, prioridades y reportes ordenan los lotes automáticamente de la fecha de vencimiento más próxima a la más lejana.",
  },
  {
    q: "¿Cómo registro un producto que solo indica Mes y Año en el empaque (ej. Nov-26)?",
    a: "Al crear o editar un lote, cambia el selector de fecha a 'Solo Mes / Año'. El sistema mostrará 'Nov-26' en pantalla y planillas, pero internamente usará el último día de ese mes para calcular alertas y días restantes con precisión.",
  },
  {
    q: "¿Por qué no me deja eliminar un producto del Catálogo?",
    a: "Por integridad de datos, no es posible borrar un producto si aún tiene lotes de inventario o registros de averías asociados. Primero debes eliminar o depurar sus lotes/averías si fue un registro erróneo.",
  },
  {
    q: "¿Cómo funciona el envío de alertas por WhatsApp?",
    a: "El sistema evalúa los lotes activos con vencimiento ≤ 30 días. Si configuraste una API en el archivo .env (Meta Cloud API, CallMeBot, Twilio o Webhook), el envío es automático al escanear. Si no hay API configurada, al pulsar 'Enviar Resumen por WhatsApp' se abre una vista previa lista para copiar o abrir directamente en WhatsApp Web y marcar como enviado.",
  },
  {
    q: "¿Qué pasa con el stock cuando reporto o elimino una avería?",
    a: "Al reportar una avería puedes activar 'Descontar unidades afectadas del inventario disponible del lote'. Si luego descubres que fue un error y eliminas esa avería, el sistema te preguntará si deseas restaurar automáticamente esas unidades al lote.",
  },
  {
    q: "¿Cómo cambio entre modo claro y modo oscuro?",
    a: "Pulsa el botón 'Modo oscuro / Modo claro' en la barra superior (o el ícono de sol/luna en el móvil y en la pantalla de inicio de sesión). Tu preferencia queda guardada automáticamente.",
  },
];

export function HelpBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>("resumen");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (!isTyping && e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((prev) => !prev);
    window.addEventListener("cf-toggle-help", onToggle);
    return () => window.removeEventListener("cf-toggle-help", onToggle);
  }, []);

  const currentModule = useMemo(() => {
    if (pathname === "/") return MODULE_GUIDES[0];
    return (
      MODULE_GUIDES.find(
        (m) =>
          m.href !== "/" && m.href !== "#cuenta" && pathname.startsWith(m.href)
      ) ?? MODULE_GUIDES[0]
    );
  }, [pathname]);

  const trimmedQuery = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!trimmedQuery) return null;
    const matchedModules = MODULE_GUIDES.filter((m) =>
      [m.title, m.shortDesc, m.whatItDoes, ...m.keyActions, m.tips]
        .join(" ")
        .toLowerCase()
        .includes(trimmedQuery)
    );
    const matchedFaqs = FAQ_ITEMS.filter((f) =>
      `${f.q} ${f.a}`.toLowerCase().includes(trimmedQuery)
    );
    const matchedPackaging = PACKAGING_GLOSSARY.filter((p) =>
      `${p.code} ${p.name} ${p.desc}`.toLowerCase().includes(trimmedQuery)
    );
    const matchedStatuses = STATUS_GLOSSARY.filter((s) =>
      `${s.label} ${s.meaning}`.toLowerCase().includes(trimmedQuery)
    );
    return {
      modules: matchedModules,
      faqs: matchedFaqs,
      packaging: matchedPackaging,
      statuses: matchedStatuses,
      total:
        matchedModules.length +
        matchedFaqs.length +
        matchedPackaging.length +
        matchedStatuses.length,
    };
  }, [trimmedQuery]);

  return (
    <>
      {/* Botón flotante de Ayuda (escritorio; en móvil se abre desde la barra superior) */}
      <div className="fixed bottom-5 right-5 z-40 hidden items-center gap-2 lg:flex">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label="Abrir burbuja de ayuda del sistema"
          className={`group inline-flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 ${
            open
              ? "border-slate-800 bg-slate-900 text-white dark:border-slate-600 dark:bg-slate-800"
              : "border-indigo-500/30 bg-indigo-600 text-white hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-xl"
          }`}
        >
          {open ? (
            <X className="h-5 w-5 transition-transform duration-200" />
          ) : (
            <HelpCircle className="h-5 w-5 transition-transform duration-200 group-hover:rotate-12" />
          )}
          <span className="hidden sm:inline">
            {open ? "Cerrar Ayuda" : "Guía del Sistema"}
          </span>
          {!open && (
            <span className="hidden rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide sm:inline">
              ?
            </span>
          )}
        </button>
      </div>

      {/* Panel / Burbuja de Ayuda Completa */}
      {open && (
        <>
          <div
            className="cf-animate-fade fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[1px] lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            className="cf-animate-popover fixed inset-x-3 bottom-[4.75rem] top-16 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/10 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/10 sm:inset-x-auto sm:bottom-20 sm:right-5 sm:top-auto sm:h-[min(78vh,680px)] sm:w-[calc(100vw-2.5rem)] sm:max-w-xl"
            role="dialog"
            aria-label="Centro de Ayuda del Sistema Corta Fecha"
          >
          {/* Cabecera */}
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 px-5 py-4 text-white dark:border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/30">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">
                    Centro de Ayuda — Corta Fecha
                  </h2>
                  <p className="text-xs text-slate-300">
                    Explicación completa de módulos, reglas, empaques y reportes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar centro de ayuda"
                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Buscador interno */}
            <div className="relative mt-3.5">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar duda, sigla o función (ej. whatsapp, paca, oscuro, pdf)..."
                className="w-full rounded-xl border border-white/15 bg-white/10 py-2 pl-9 pr-8 text-xs text-white placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white/15 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-2 rounded p-0.5 text-slate-300 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Pestañas */}
            {!trimmedQuery && (
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
                {(
                  [
                    { id: "resumen", label: "Inicio y Flujo" },
                    { id: "modulos", label: "Módulos (8)" },
                    { id: "reglas", label: "Empaques y Semáforo" },
                    { id: "faq", label: "Preguntas (FAQ)" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      tab === item.id
                        ? "bg-white text-slate-900 shadow-xs"
                        : "bg-white/10 text-slate-200 hover:bg-white/20"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contenido scrollable */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4 dark:bg-slate-950/60 sm:p-5">
            {searchResults ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {searchResults.total} resultado(s) para{" "}
                  <span className="text-indigo-700 dark:text-indigo-400">
                    &ldquo;{query}&rdquo;
                  </span>
                </p>

                {searchResults.total === 0 && (
                  <div className="ui-card p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No encontramos coincidencias exactas. Prueba palabras como{" "}
                    <strong>lote</strong>, <strong>whatsapp</strong>,{" "}
                    <strong>excel</strong>, <strong>oscuro</strong>,{" "}
                    <strong>cuarentena</strong> o <strong>paca</strong>.
                  </div>
                )}

                {searchResults.modules.map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <div key={mod.id} className="ui-card space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${mod.badgeColor}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {mod.title}
                          </h3>
                        </div>
                        {mod.href !== "#cuenta" && (
                          <Link
                            href={mod.href}
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            Ir <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {mod.whatItDoes}
                      </p>
                      <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300">
                        {mod.keyActions.map((act) => (
                          <li key={act} className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                {searchResults.packaging.map((pk) => (
                  <div key={pk.code} className="ui-card p-3.5 text-xs">
                    <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      {pk.code}
                    </span>{" "}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {pk.name}:
                    </strong>{" "}
                    <span className="text-slate-600 dark:text-slate-300">
                      {pk.desc}
                    </span>
                  </div>
                ))}

                {searchResults.statuses.map((st) => (
                  <div key={st.label} className="ui-card p-3.5 text-xs">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 font-semibold ${st.badge}`}
                    >
                      {st.label}
                    </span>
                    <p className="mt-1.5 text-slate-600 dark:text-slate-300">
                      {st.meaning}
                    </p>
                  </div>
                ))}

                {searchResults.faqs.map((f) => (
                  <div key={f.q} className="ui-card p-4 text-xs">
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {f.q}
                    </p>
                    <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                      {f.a}
                    </p>
                  </div>
                ))}
              </div>
            ) : tab === "resumen" ? (
              <div className="space-y-4">
                {/* Ayuda contextual */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-800/70 dark:bg-indigo-950/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      <Sparkles className="h-3 w-3" />
                      Pantalla actual
                    </span>
                    <button
                      type="button"
                      onClick={() => setTab("modulos")}
                      className="text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                    >
                      Ver todos los módulos →
                    </button>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {currentModule.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {currentModule.whatItDoes}
                  </p>
                  <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-[11px] font-medium text-indigo-900 dark:bg-slate-900/80 dark:text-indigo-200">
                    <strong>Consejo práctico:</strong> {currentModule.tips}
                  </p>
                </div>

                {/* Qué es el sistema */}
                <div className="ui-card space-y-2 p-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    ¿Qué es el Sistema Corta Fecha de Distrimarcas?
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    Es una plataforma diseñada para la{" "}
                    <strong>gestión preventiva de vencimientos y averías</strong>{" "}
                    en Bodega Distrimarcas. Permite controlar el inventario real
                    por lote y tipo de empaque (Cajas, Pacas, Dispacks, Displays,
                    Bolsas y Unidades), priorizar despachos bajo criterio{" "}
                    <strong>FEFO</strong> (Primero en Vencer, Primero en Salir),
                    enviar alertas a WhatsApp y emitir las planillas oficiales en
                    Excel y PDF.
                  </p>
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                    <SunMoon className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                    <span>
                      Puedes alternar entre <strong>Modo Claro</strong> y{" "}
                      <strong>Modo Oscuro</strong> en cualquier momento desde la
                      barra superior.
                    </span>
                  </div>
                </div>

                {/* Flujo diario en 5 pasos */}
                <div className="ui-card p-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Flujo Diario Recomendado en Bodega
                  </h3>
                  <ol className="mt-3 space-y-2.5 text-xs">
                    {[
                      {
                        step: "1",
                        title: "Revisar el Panel Principal",
                        desc: "Verifica el semáforo de vencimientos y la tabla de Lotes Prioritarios (Vencidos, ≤45 días o en Cuarentena).",
                        href: "/",
                      },
                      {
                        step: "2",
                        title: "Escanear y Notificar por WhatsApp",
                        desc: "En Alertas Automáticas, ejecuta el escaneo y envía el resumen de lotes con ≤30 días al WhatsApp de supervisión.",
                        href: "/alertas",
                      },
                      {
                        step: "3",
                        title: "Mantener al día Inventario y Lotes",
                        desc: "Registra ingresos nuevos, actualiza cantidades tras despachos (CJ, PC, DPL, DISP, BL, UN) o pasa lotes a Cuarentena.",
                        href: "/inventario",
                      },
                      {
                        step: "4",
                        title: "Registrar Inspecciones y Averías",
                        desc: "Documenta recorridos físicos (puedes sincronizar el stock real) y reporta mercancía dañada para descontarla o bloquearla.",
                        href: "/inspecciones",
                      },
                      {
                        step: "5",
                        title: "Descargar Planillas Oficiales",
                        desc: "Exporta en Excel (.xlsx) o PDF (.pdf) la Planilla Corta Fechas, Productos en Averías o el Reporte General Multi-Hoja.",
                        href: "/reportes",
                      },
                    ].map((item) => (
                      <li
                        key={item.step}
                        className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                          {item.step}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.title}
                            </p>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className="shrink-0 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              Abrir →
                            </Link>
                          </div>
                          <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                            {item.desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : tab === "modulos" ? (
              <div className="space-y-3">
                {MODULE_GUIDES.map((mod) => {
                  const Icon = mod.icon;
                  const isHere = mod.id === currentModule.id;
                  return (
                    <div
                      key={mod.id}
                      className={`ui-card space-y-2.5 p-4 ${
                        isHere
                          ? "border-indigo-300 ring-2 ring-indigo-500/30 dark:border-indigo-500/60"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${mod.badgeColor}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {mod.title}
                              </h3>
                              {isHere && (
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                                  Actual
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {mod.shortDesc}
                            </p>
                          </div>
                        </div>
                        {mod.href !== "#cuenta" && (
                          <Link
                            href={mod.href}
                            onClick={() => setOpen(false)}
                            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                          >
                            Ir →
                          </Link>
                        )}
                      </div>

                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {mod.whatItDoes}
                      </p>

                      <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Botones y funciones principales
                        </p>
                        <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                          {mod.keyActions.map((action) => (
                            <li key={action} className="flex items-start gap-2">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <p className="text-[11px] text-indigo-800 dark:text-indigo-300">
                        <strong>Tip:</strong> {mod.tips}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : tab === "reglas" ? (
              <div className="space-y-4">
                <div className="ui-card p-4">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Sistema Multi-Empaque (Bodega Distrimarcas)
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Cada lote suma automáticamente las unidades equivalentes según
                    la configuración del producto y genera el texto oficial de la
                    planilla (por ejemplo: <code>3 PC (108 UN)</code> o{" "}
                    <code>2 CJ + 5 UN</code>).
                  </p>
                  <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {PACKAGING_GLOSSARY.map((item) => (
                      <div
                        key={item.code}
                        className="flex items-start gap-3 bg-white px-3 py-2.5 text-xs dark:bg-slate-900"
                      >
                        <span className="w-12 shrink-0 rounded-md bg-indigo-50 py-0.5 text-center font-mono font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                          {item.code}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </p>
                          <p className="text-slate-600 dark:text-slate-400">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ui-card p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Semáforo de Vencimientos y Estados de Lote
                    </h3>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {STATUS_GLOSSARY.map((st) => (
                      <div
                        key={st.label}
                        className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 font-semibold ${st.badge}`}
                        >
                          {st.label}
                        </span>
                        <p className="mt-1.5 text-slate-600 dark:text-slate-300">
                          {st.meaning}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ui-card p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Reglas de Notificación por WhatsApp
                    </h3>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <li>
                      • Solo notifica lotes activos (con existencias y fuera de
                      cuarentena) cuyo vencimiento sea <strong>≤ 30 días</strong>.
                    </li>
                    <li>
                      • Soporta envío automático por API (Meta Cloud, CallMeBot,
                      Twilio o Webhook en <code>.env</code>) o envío manual con 1
                      clic por <strong>WhatsApp Web</strong>.
                    </li>
                    <li>
                      • Marca cada alerta enviada para evitar duplicados en los
                      escaneos automáticos.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {FAQ_ITEMS.map((item) => (
                  <div key={item.q} className="ui-card p-4">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 sm:text-sm">
                      {item.q}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pie de ayuda */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <span>
              Atajo de teclado: pulsa{" "}
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                ?
              </kbd>{" "}
              para abrir/cerrar
            </span>
            <span>Sistema Corta Fecha · Distrimarcas S.A.S.</span>
          </div>
        </div>
        </>
      )}
    </>
  );
}
