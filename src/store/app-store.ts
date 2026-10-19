"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

export type ViewKey =
  | "dashboard"
  | "clients"
  | "client_new"
  | "client_view"
  | "cases"
  | "case_new"
  | "case_view"
  | "documents"
  | "service_catalog"
  | "appointments"
  | "notifications"
  | "agreements"
  | "audit_log"
  | "reports"
  | "ai_assistant"
  | "ai_knowledge"
  | "ai_config"
  | "finance"
  | "users"
  | "branches"
  | "configuration"
  | "my_tasks"
  | "communications"
  | "client_portal"
  | "ejari"
  | "ejari_view"
  | "templates"
  | "workflows"
  | "analytics"
  | "whatsapp_crm";

export type SessionInfo = {
  token: string;
  csrfToken?: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  branchId?: string | null;
  branchName?: string | null;
};

type AppState = {
  // Session
  session: SessionInfo | null;
  setSession: (s: SessionInfo | null) => void;
  logout: () => void;

  // Locale
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;

  // View routing (SPA-style)
  view: ViewKey;
  viewParams: Record<string, string>;
  previousView: ViewKey | null;
  previousViewParams: Record<string, string>;
  setView: (v: ViewKey, params?: Record<string, string>) => void;
  goBack: () => void;

  // Sidebar collapsed (mobile)
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;

  // Phase 17.4 — Desktop sidebar collapse (icon-only at narrow widths).
  // Persisted so the user's preference sticks across sessions.
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (b: boolean) => void;
  toggleSidebarCollapsed: () => void;

  // Phase 17.3 — Refresh trigger for cross-view data freshness.
  // Incremented on entity mutations (client/case/doc create/update/delete)
  // so that views with useEffect deps on `refreshTrigger` re-fetch.
  refreshTrigger: number;
  triggerRefresh: () => void;
};

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      session: null,
      setSession: (s) => set({ session: s }),
      logout: () => set({ session: null, view: "dashboard" }),

      locale: "en",
      setLocale: (l) => set({ locale: l }),
      toggleLocale: () => set({ locale: get().locale === "en" ? "ar" : "en" }),

      view: "dashboard",
      viewParams: {},
      // Phase 16.4 — track previous view for Back navigation
      previousView: null as any,
      previousViewParams: {} as Record<string, string>,
      setView: (v, params = {}) => set((state) => ({ 
        previousView: state.view, 
        previousViewParams: state.viewParams,
        view: v, 
        viewParams: params, 
        sidebarOpen: false 
      })),
      goBack: () => set((state) => {
        if (state.previousView) {
          return { view: state.previousView, viewParams: state.previousViewParams, previousView: null };
        }
        return { view: "dashboard", viewParams: {} };
      }),

      sidebarOpen: false,
      setSidebarOpen: (b) => set({ sidebarOpen: b }),

      // Phase 17.4 — desktop sidebar collapse
      sidebarCollapsed: false,
      setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),
      toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      // Phase 17.3 — refresh trigger for cross-view data freshness
      refreshTrigger: 0,
      triggerRefresh: () => set((s) => ({ refreshTrigger: s.refreshTrigger + 1 })),
    }),
    {
      name: "trustee-portal",
      partialize: (s) => ({ session: s.session, locale: s.locale, sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
);
