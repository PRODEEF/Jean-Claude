import { createContext, useContext, type ReactNode } from "react";

const SidebarCollapsedContext = createContext(false);

/**
 * La barre est-elle repliée ? Le bandeau des écrans s'en sert pour laisser
 * le titre commencer à droite du bouton qui la rouvre.
 */
export function SidebarChromeProvider({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
      {children}
    </SidebarCollapsedContext.Provider>
  );
}

export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapsedContext);
}
