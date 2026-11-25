"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ClipboardCheck,
  FileSpreadsheet,
  HelpCircle,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
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
import { fetchWithCache, invalidateCache } from "@/lib/client-cache";

const HelpBubble = dynamic(
  () => import("@/components/HelpBubble").then((m) => m.HelpBubble),
  { ssr: false }
);

const NAV_ITEMS = [
  {
    href: "/",
    label: "Panel Principal",
    mobileLabel: "Inicio",
    shortDesc: "Resumen ejecutivo y semáforo FEFO",
    icon: LayoutDashboard,
  },
  {
    href: "/inventario",
    label: "Inventario y Lotes",
    mobileLabel: "Inventario",
    shortDesc: "Catálogo, conteo multi-empaque y fechas",
    icon: Package,
  },
  {
    href: "/alertas",
    label: "Alertas Automáticas",
    mobileLabel: "Alertas",
    shortDesc: "Vencimientos ≤60d y envío Telegram/WhatsApp",
    icon: Bell,
    showBadge: true,
  },
  {
    href: "/inspecciones",
    label: "Inspecciones",
    mobileLabel: "Inspección",
    shortDesc: "Verificaciones físicas y ajuste de stock",
    icon: ClipboardCheck,
  },
  {
    href: "/averias",
    label: "Productos Averiados",
    mobileLabel: "Averías",
    shortDesc: "Novedades, pérdidas y cuarentena",
    icon: ShieldAlert,
  },
  {
    href: "/historial",
    label: "Historial Auditoría",
    mobileLabel: "Historial",
    shortDesc: "Trazabilidad completa de movimientos",
    icon: History,
  },
  {
    href: "/reportes",
    label: "Reportes Excel / PDF",
    mobileLabel: "Reportes",
    shortDesc: "Planillas oficiales Distrimarcas S.A.S.",
    icon: FileSpreadsheet,
  },
];

const MOBILE_PRIMARY_HREFS = ["/", "/inventario", "/alertas", "/averias"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notify } = useToast();

  const [mobileOpen, setMobileOpen] = useState(false);
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
        notify({ title: "Error al actualizar cuenta", description: msg, variant: "error" });
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

  const renderLinks = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Menú principal">
      <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Módulos Operativos
      </p>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
              isActive
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon
                className={`h-4 w-4 shrink-0 transition-transform duration-150 ${
                  isActive
                    ? "text-white"
                    : "text-slate-400 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400"
                }`}
              />
              <span>{item.label}</span>
            </span>
            {item.showBadge && activeAlerts > 0 && (
              <span
                className={`tabular-nums rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isActive
                    ? "bg-white text-indigo-700"
                    : "bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300"
                }`}
              >
                {activeAlerts}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const renderUserFooter = () => (
    <div className="space-y-2.5 border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
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

      <div className="flex gap-2">
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
          className="ui-btn ui-btn-secondary flex-1 py-2 text-xs sm:py-1.5"
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
          className="ui-btn flex-1 border border-red-200 bg-red-50 py-2 text-xs text-red-700 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950/80 sm:py-1.5"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>
    </div>
  );

  return (
    <AppSessionContext.Provider value={sessionValue}>
    <div className="flex min-h-screen bg-[var(--cf-bg)]">
      {/* Sidebar Desktop */}
      <aside className="hidden w-68 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <Link href="/" className="group block space-y-2.5">
            <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 shadow-2xs transition-shadow group-hover:shadow-sm dark:border-slate-700">
              <Image
                src="/images/distrimarcas-logo.jpg"
                alt="Distrimarcas S.A.S."
                width={1024}
                height={341}
                priority
                className="h-11 w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="min-w-0">
                <p className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Corta Fecha
                </p>
                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Distrimarcas S.A.S.
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                Bodega
              </span>
            </div>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">{renderLinks()}</div>
        {renderUserFooter()}
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop Top Context Bar */}
        <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 lg:flex">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
              {currentNav.label}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {currentNav.shortDesc}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeAlerts > 0 && (
              <Link
                href="/alertas"
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-950"
              >
                <Bell className="h-3.5 w-3.5" />
                <span className="tabular-nums">{activeAlerts}</span> alertas
                activas
              </Link>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={openHelpBubble}
              className="ui-btn ui-btn-secondary py-1.5 text-xs"
            >
              <HelpCircle className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              Guía del sistema
            </button>
          </div>
        </header>

        {/* Mobile App Top Bar */}
        <header className="pt-safe sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/90 bg-white/95 px-3.5 py-2.5 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/"
              className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-1.5 py-1 shadow-xs dark:border-slate-700"
              aria-label="Ir al inicio"
            >
              <Image
                src="/images/distrimarcas-logo.jpg"
                alt="Distrimarcas S.A.S."
                width={1024}
                height={341}
                priority
                className="h-7 w-auto max-w-[92px] object-contain"
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
            <ThemeToggle compact className="h-9 w-9 rounded-xl p-0" />
            <button
              type="button"
              onClick={openHelpBubble}
              aria-label="Abrir guía de ayuda"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-950"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Abrir menú completo"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Mobile Bottom Sheet Menu ("Más" / Menú completo) */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
            <div
              className="cf-animate-fade fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] dark:bg-black/75"
              onClick={() => setMobileOpen(false)}
            />
            <div className="cf-animate-sheet pb-safe relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
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

              {renderUserFooter()}
            </div>
          </div>
        )}

        <main className="cf-animate-fade mx-auto w-full max-w-7xl flex-1 p-3.5 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-12">
          {children}
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Navegación móvil inferior"
          className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
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

      {/* Burbuja de Ayuda Completa del Sistema */}
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
        <form id="account-form" noValidate onSubmit={handleUpdateAccount} className="space-y-4">
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
