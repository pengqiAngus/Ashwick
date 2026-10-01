"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyTheme, DEFAULT_THEME, readStoredTheme, themeById, type ThemeId } from "@/lib/theme";

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useLayoutEffect(() => {
    const id = readStoredTheme();
    applyTheme(id);
    setThemeState(id);
  }, []);

  function setTheme(id: ThemeId) {
    applyTheme(id);
    setThemeState(id);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          theme={themeById(theme).colorScheme}
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            },
          }}
        />
      </MotionConfig>
    </ThemeContext.Provider>
  );
}
