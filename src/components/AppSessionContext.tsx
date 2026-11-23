"use client";

import { createContext, useContext } from "react";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

export interface AppSessionContextValue {
  user: SessionUser | null;
  warehouseName: string;
  activeAlerts: number;
  setUser: (user: SessionUser | null) => void;
  setActiveAlerts: (count: number) => void;
  refreshSession: (force?: boolean) => Promise<void>;
  refreshAlertsCount: () => Promise<void>;
}

const noopAsync = async () => {};

export const AppSessionContext = createContext<AppSessionContextValue>({
  user: null,
  warehouseName: "Bodega Distrimarcas",
  activeAlerts: 0,
  setUser: () => {},
  setActiveAlerts: () => {},
  refreshSession: noopAsync,
  refreshAlertsCount: noopAsync,
});

export function useAppSession(): AppSessionContextValue {
  return useContext(AppSessionContext);
}
