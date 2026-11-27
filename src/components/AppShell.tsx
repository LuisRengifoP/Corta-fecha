"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  HelpCircle,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  ShieldAlert,
  UserCheck,
  Warehouse,
  X,
} from "lucide-react";
import {
  AppSessionContext,
  SessionUser,
} from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { fetchWithCache, invalidateCache } from "@/lib/client-cache";

const HelpBubble = dynamic(
  () => import("@/components/HelpBubble").then((m) => m.HelpBubble),
  { ssr: false }
);

interface NavItem {
  href: string;
  label: string;
  mobileLabel: string;
  shortDesc: string;
  group: "Operación" | "Control físico" | "Trazabilidad";
  icon: React.ComponentType<{ className?: string }>;
  showBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Panel Principal",
    mobileLabel: "Inicio",
    shortDesc: "Resumen ejecutivo y semáforo FEFO",
    group: "Operación",
    icon: LayoutDashboard,
  },
  {
    href: "/inventario",
    label: "Inventario y Lotes",
    mobileLabel: "Inventario",
    shortDesc: "Catálogo, conteo multi-empaque y fechas",
    group: "Operación",
    icon: Package,
  },
  {
    href: "/alertas",
    label: "Alertas Automáticas",
    mobileLabel: "Alertas",
    shortDesc: "Vencimientos ≤60d y envío a Telegram",
    group: "Operación",
    icon: Bell,
    showBadge: true,
  },
  {
    href: "/inspecciones",
    label: "Inspecciones",
    mobileLabel: "Inspección",
    shortDesc: "Verificaciones físicas y ajuste de stock",
    group: "Control físico",
    icon: ClipboardCheck,
  },
  {
    href: "/averias",
    label: "Productos Averiados",
    mobileLabel: "Averías",
    shortDesc: "Novedades, pérdidas y cuarentena",
    group: "Control físico",
    icon: ShieldAlert,
  },
  {
    href: "/historial",
    label: "Historial Auditoría",
    mobileLabel: "Historial",
    shortDesc: "Trazabilidad completa de movimientos",
    group: "Trazabilidad",
    icon: History,
  },
  {
    href: "/reportes",
    label: "Reportes Excel / PDF",
    mobileLabel: "Reportes",
    shortDesc: "Planillas oficiales Distrimarcas S.A.S.",
    group: "Trazabilidad",
    icon: FileSpreadsheet,
  },
];

const NAV_GROUPS: Array<NavItem["group"]> = [
  "Operación",
  "Control físico",
  "Trazabilidad",
];

const MOBILE_PRIMARY_HREFS = ["/", "/inventario", "/alertas", "/averias"];
const SIDEBAR_COLLAPSED_KEY = "cf-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notify } = useToast();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<number>(0);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [warehouseName, setWarehouseName] = useState<string>(
    "Bodega Distrimarcas"
  );

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountForm, setAccountForm] = useState({
    fullName: "",
    currentPassword: "",
    newPassword: "",
  });
  const [accountMsg, setAccountMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") setSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isLoginPage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoginPage]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const refreshSession = useCallback(async (force = false) => {
    try {
      const data = await fetchWithCache<{
        user?: SessionUser;
        warehouse?: { name?: string } | null;
      }>(
        "session:me",
        async () => {
          const res = await fetch("/api/auth/me");
          if (!res.ok) throw new Error("No se pudo cargar la sesión");
          return res.json();
        },
        { force, ttlMs: 300_000 }
      );
      if (data?.user) {
        setUser(data.user);
        setAccountForm((prev) => ({
          ...prev,
          fullName: data.user!.fullName,
        }));
      }
      if (data?.warehouse?.name) {
        setWarehouseName(data.warehouse.name);
      }
    } catch {
      // Ignorar errores transitorios de red
    }
  }, []);

  const refreshAlertsCount = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts?acknowledged=false&countOnly=true");
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.count === "number") {
          setActiveAlerts(data.count);
        }
      }
    } catch {
      // Ignorar errores transitorios de red
    }
  }, []);

  useEffect(() => {
    if (isLoginPage) return;
    if (!user) {
      void refreshSession(false);
    }
  }, [isLoginPage, user, refreshSession]);

  useEffect(() => {
    if (isLoginPage) return;
    void refreshAlertsCount();
    const onRefreshAlerts = () => {
      void refreshAlertsCount();
    };
    window.addEventListener("cf-refresh-alerts", onRefreshAlerts);
    return () => {
      window.removeEventListener("cf-refresh-alerts", onRefreshAlerts);
    };
  }, [isLoginPage, refreshAlertsCount]);

  const currentNav = useMemo(() => {
    if (pathname === "/") return NAV_ITEMS[0];
    return (
      NAV_ITEMS.find(
        (item) => item.href !== "/" && pathname.startsWith(item.href)
      ) ?? NAV_ITEMS[0]
    );
  }, [pathname]);

  const isSecondaryMobileRoute = useMemo(
    () =>
      !MOBILE_PRIMARY_HREFS.some((href) =>
        href === "/" ? pathname === "/" : pathname.startsWith(href)
      ),
    [pathname]
  );

  const mobilePrimaryItems = useMemo(
    () => NAV_ITEMS.filter((item) => MOBILE_PRIMARY_HREFS.includes(item.href)),
    []
  );

  const sessionValue = useMemo(
    () => ({
      user,
      warehouseName,
      activeAlerts,
      setUser,
      setActiveAlerts,
      refreshSession,
      refreshAlertsCount,
    }),
    [user, warehouseName, activeAlerts, refreshSession, refreshAlertsCount]
  );

  if (isLoginPage) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Continuar con redirección al login
    } finally {
      invalidateCache();
      setUser(null);
      setActiveAlerts(0);
      router.push("/login");
      router.refresh();
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountMsg(null);
    if (!accountForm.fullName.trim() || !accountForm.currentPassword) {
      setAccountMsg({
        type: "err",
        text: "El nombre y la contraseña actual son obligatorios.",
      });
      return;
    }
    setAccountBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "No se pudo actualizar la cuenta";
        setAccountMsg({ type: "err", text: msg });
        notify({
          title: "Error al actualizar cuenta",
          description: msg,
          variant: "error",
        });
        return;
      }
      setUser(json.user);
      invalidateCache("session:me");
      setAccountForm({
        fullName: json.user.fullName,
        currentPassword: "",
        newPassword: "",
      });
      setAccountMsg({
        type: "ok",
        text: "Datos de acceso actualizados correctamente.",
      });
      notify({
        title: "Cuenta actualizada",
        description: `Los cambios de acceso para ${json.user.fullName} se guardaron.`,
        variant: "success",
      });
    } catch {
      const msg = "Error de conexión al guardar cambios de la cuenta.";
      setAccountMsg({ type: "err", text: msg });
      notify({ title: "Error de red", description: msg, variant: "error" });
    } finally {
      setAccountBusy(false);
    }
  };

  const openHelpBubble = () => {
    window.dispatchEvent(new CustomEvent("cf-toggle-help"));
  };

  const renderDesktopNav = () => (
    <nav className="flex flex-col gap-4 px-2.5 py-4" aria-label="Menú principal">
      {NAV_GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((i) => i.group === group);
        return (
          <div key={group} className="space-y-1">
            {!sidebarCollapsed ? (
              <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group}
              </p>
            ) : (
              <div className="mx-3 border-t border-slate-100 dark:border-slate-800/80" />
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`group relative flex items-center rounded-lg text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                      sidebarCollapsed
                        ? "justify-center px-2 py-2.5"
                        : "justify-between px-2.5 py-2"
                    } ${
                      isActive
                        ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-indigo-600 dark:bg-indigo-400" />
                    )}
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200"
                        }`}
                      />
                      {!sidebarCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </span>
                    {item.showBadge && activeAlerts > 0 && (
                      <span
                        className={`tabular-nums rounded-full font-bold ${
                          sidebarCollapsed
                            ? "absolute right-1.5 top-1.5 h-2 w-2 bg-red-600 text-[0px]"
                            : isActive
                            ? "bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white"
                            : "bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-950/80 dark:text-red-300"
                        }`}
                      >
                        {sidebarCollapsed ? "" : activeAlerts}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const renderUserFooter = (collapsed = false) => (
    <div className="space-y-2 border-t border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      {!collapsed ? (
        <>
          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Warehouse className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">{warehouseName}</span>
            </div>
            {user && (
              <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">{user.fullName}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  @{user.username} · {user.role}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setAccountMsg(null);
                if (user?.fullName) {
                  setAccountForm((prev) => ({
                    ...prev,
                    fullName: prev.fullName || user.fullName,
                  }));
                }
                setShowAccountModal(true);
              }}
              className="ui-btn ui-btn-secondary py-1.5 text-xs"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Clave
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                void handleLogout();
              }}
              className="ui-btn ui-btn-ghost border border-slate-200/80 py-1.5 text-xs text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-800 dark:text-red-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            title="Cuenta y contraseña"
            aria-label="Cuenta y contraseña"
            onClick={() => {
              setAccountMsg(null);
              setShowAccountModal(true);
            }}
            className="ui-btn ui-btn-secondary h-9 w-9 p-0"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            onClick={() => void handleLogout()}
            className="ui-btn ui-btn-ghost h-9 w-9 p-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <AppSessionContext.Provider value={sessionValue}>
      <div className="flex min-h-screen bg-[var(--cf-bg)]">
        {/* Sidebar Desktop Colapsable */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-slate-200/90 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-[#0d121c] lg:sticky lg:top-0 lg:flex lg:h-screen ${
            sidebarCollapsed ? "w-[72px]" : "w-64"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3.5 py-3.5 dark:border-slate-800">
            <Link
              href="/"
              className={`flex min-w-0 items-center gap-2.5 ${
                sidebarCollapsed ? "justify-center" : ""
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700">
                <Image
                  src="/images/distrimarcas-logo.jpg"
                  alt="Distrimarcas S.A.S."
                  width={1024}
                  height={341}
                  priority
                  className="h-full w-full object-contain"
                />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Corta Fecha
                  </p>
                  <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Distrimarcas S.A.S.
                  </p>
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={sidebarCollapsed ? "Expandir menú" : "Compactar menú"}
              aria-label={sidebarCollapsed ? "Expandir menú" : "Compactar menú"}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">{renderDesktopNav()}</div>
          {renderUserFooter(sidebarCollapsed)}
        </aside>

        {/* Main Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop Top Context Bar */}
          <header className="sticky top-0 z-30 hidden h-14 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-[#0d121c]/85 lg:flex">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {currentNav.label}
              </span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                {currentNav.shortDesc}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-800 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Buscar lote, SKU...</span>
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                  Ctrl K
                </kbd>
              </button>

              {activeAlerts > 0 && (
                <Link
                  href="/alertas"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400" />
                  <span className="tabular-nums">{activeAlerts}</span> alertas
                </Link>
              )}

              <ThemeToggle />

              <button
                type="button"
                onClick={openHelpBubble}
                title="Guía del sistema (pulsa ?)"
                className="ui-btn ui-btn-secondary py-1.5 text-xs"
              >
                <HelpCircle className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Guía</span>
                <kbd className="hidden rounded border border-slate-200 bg-slate-100 px-1 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 xl:inline">
                  ?
                </kbd>
              </button>
            </div>
          </header>

          {/* Mobile App Top Bar */}
          <header className="pt-safe sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/90 bg-white/95 px-3.5 py-2.5 backdrop-blur-lg dark:border-slate-800 dark:bg-[#0d121c]/95 lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link
                href="/"
                className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-1.5 py-1 dark:border-slate-700"
                aria-label="Ir al inicio"
              >
                <Image
                  src="/images/distrimarcas-logo.jpg"
                  alt="Distrimarcas S.A.S."
                  width={1024}
                  height={341}
                  priority
                  className="h-7 w-auto max-w-[88px] object-contain"
                />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
                  {currentNav.label}
                </p>
                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {warehouseName}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                aria-label="Búsqueda rápida"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Search className="h-4 w-4" />
              </button>
              <ThemeToggle compact className="h-9 w-9 rounded-xl p-0" />
              <button
                type="button"
                onClick={openHelpBubble}
                aria-label="Abrir guía de ayuda"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-300"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Mobile Bottom Sheet Menu ("Más") */}
          {mobileOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
              <div
                className="cf-animate-fade fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] dark:bg-black/75"
                onClick={() => setMobileOpen(false)}
              />
              <div className="cf-animate-sheet pb-safe relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111622]">
                <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700" />
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-1.5 py-1 dark:border-slate-700">
                      <Image
                        src="/images/distrimarcas-logo.jpg"
                        alt="Distrimarcas S.A.S."
                        width={1024}
                        height={341}
                        className="h-7 w-auto max-w-[92px] object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
                        Corta Fecha
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Distrimarcas S.A.S.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    aria-label="Cerrar menú"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Todos los módulos
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {NAV_ITEMS.map((item) => {
                      const isActive =
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`relative flex flex-col gap-1.5 rounded-2xl border p-3.5 transition-all active:scale-[0.98] ${
                            isActive
                              ? "border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                              : "border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <Icon
                              className={`h-5 w-5 ${
                                isActive
                                  ? "text-white"
                                  : "text-indigo-600 dark:text-indigo-400"
                              }`}
                            />
                            {item.showBadge && activeAlerts > 0 && (
                              <span
                                className={`tabular-nums rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  isActive
                                    ? "bg-white text-indigo-700"
                                    : "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300"
                                }`}
                              >
                                {activeAlerts}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold leading-snug">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {renderUserFooter(false)}
              </div>
            </div>
          )}

          <main className="mx-auto w-full max-w-[1400px] flex-1 p-3.5 pb-24 sm:p-6 sm:pb-24 lg:px-8 lg:py-7 lg:pb-12">
            {children}
          </main>

          {/* Mobile Bottom Tab Bar */}
          <nav
            aria-label="Navegación móvil inferior"
            className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-lg dark:border-slate-800 dark:bg-[#0d121c]/95 lg:hidden"
          >
            <div className="grid grid-cols-5 px-1 py-1">
              {mobilePrimaryItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition-colors active:scale-95 ${
                      isActive
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    <span
                      className={`relative flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-950/70"
                          : "bg-transparent"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {item.showBadge && activeAlerts > 0 && (
                        <span className="tabular-nums absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow-xs">
                          {activeAlerts > 99 ? "99+" : activeAlerts}
                        </span>
                      )}
                    </span>
                    <span className="truncate">{item.mobileLabel}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition-colors active:scale-95 ${
                  mobileOpen || isSecondaryMobileRoute
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
                aria-label="Más módulos y cuenta"
              >
                <span
                  className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
                    mobileOpen || isSecondaryMobileRoute
                      ? "bg-indigo-50 dark:bg-indigo-950/70"
                      : "bg-transparent"
                  }`}
                >
                  <Menu className="h-[18px] w-[18px]" />
                </span>
                <span>Más</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Paleta de comandos Ctrl+K */}
        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

        {/* Centro de Ayuda del Sistema */}
        <HelpBubble />

        {/* Modal Mi Cuenta / Cambiar Contraseña */}
        <Modal
          open={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          title="Cuenta de Acceso"
          subtitle="Actualiza el nombre de la encargada o cambia la contraseña de ingreso."
          icon={
            <KeyRound className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          }
          maxWidthClass="max-w-md"
          closeDisabled={accountBusy}
          footer={
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                disabled={accountBusy}
                className="ui-btn ui-btn-secondary"
              >
                Cerrar
              </button>
              <button
                type="submit"
                form="account-form"
                disabled={accountBusy}
                className="ui-btn ui-btn-primary"
              >
                {accountBusy ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          }
        >
          {accountMsg && (
            <div
              className={`mb-4 rounded-xl border p-3 text-xs font-medium ${
                accountMsg.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/50 dark:text-red-300"
              }`}
            >
              {accountMsg.text}
            </div>
          )}
          <form
            id="account-form"
            noValidate
            onSubmit={handleUpdateAccount}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nombre de la Encargada *
              </label>
              <input
                required
                value={accountForm.fullName}
                onChange={(e) =>
                  setAccountForm({ ...accountForm, fullName: e.target.value })
                }
                className="ui-input mt-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contraseña Actual *
              </label>
              <input
                type="password"
                required
                value={accountForm.currentPassword}
                onChange={(e) =>
                  setAccountForm({
                    ...accountForm,
                    currentPassword: e.target.value,
                  })
                }
                className="ui-input mt-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nueva Contraseña (opcional, mín. 6 caracteres)
              </label>
              <input
                type="password"
                value={accountForm.newPassword}
                onChange={(e) =>
                  setAccountForm({
                    ...accountForm,
                    newPassword: e.target.value,
                  })
                }
                placeholder="Dejar vacío si solo cambias el nombre"
                className="ui-input mt-1.5"
              />
            </div>
          </form>
        </Modal>
      </div>
    </AppSessionContext.Provider>
  );
}
