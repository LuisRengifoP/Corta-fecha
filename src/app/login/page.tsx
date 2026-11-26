"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { invalidateCache } from "@/lib/client-cache";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  ShieldCheck,
  User,
  Warehouse,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showHelpNote, setShowHelpNote] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo iniciar sesión");
        return;
      }
      invalidateCache();
      router.push("/");
      router.refresh();
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50/40 to-slate-200 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/60">
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="cf-animate-modal w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Cabecera corporativa */}
        <div className="border-b border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 px-6 py-6 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-fit overflow-hidden rounded-xl bg-white px-2.5 py-1.5 shadow-md">
              <Image
                src="/images/distrimarcas-logo.jpg"
                alt="Distrimarcas S.A.S."
                width={1024}
                height={341}
                priority
                className="h-10 w-auto max-w-[140px] object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Distrimarcas S.A.S.
              </p>
              <h1 className="text-xl font-bold tracking-tight">
                Sistema Corta Fecha
              </h1>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-200">
            <Warehouse className="h-3.5 w-3.5 text-indigo-300" />
            <span>Bodega Única — Control de Vencimientos y Averías</span>
          </div>
        </div>

        {/* Formulario de acceso */}
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Inicio de Sesión
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Acceso exclusivo para la persona encargada del control de bodega.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Usuario
              </label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="login-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ingresa tu usuario"
                  className="ui-input pl-9"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Contraseña
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="ui-input pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Mostrar u ocultar contraseña"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full py-2.5"
            >
              {loading ? "Verificando acceso..." : "Ingresar al Sistema"}
            </button>
          </form>

          {/* Nota rápida informativa en Login */}
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowHelpNote((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <HelpCircle className="h-4 w-4" />
              {showHelpNote
                ? "Ocultar resumen del sistema"
                : "¿Qué incluye el Sistema Corta Fecha?"}
            </button>

            {showHelpNote && (
              <div className="cf-animate-popover mt-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs text-slate-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Módulos disponibles al ingresar:
                </p>
                <ul className="space-y-1">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      Semáforo FEFO de vencimientos, alertas automáticas y envío a
                      Telegram.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      Control multi-empaque (CJ, PC, DPL, DISP, BL, UN),
                      inspecciones y averías.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      Planillas oficiales Distrimarcas en Excel/PDF y burbuja de
                      guía interactiva.
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
