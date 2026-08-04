"use client";

import * as React from "react";
import { useServerInsertedHTML } from "next/navigation";

export type Theme = "light" | "dark";

export type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
};

type ThemeContextValue = {
  theme?: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme?: Theme;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "theme";

function themeInitScript(defaultTheme: Theme, attribute: string) {
  return `(function(){try{var d=document.documentElement;var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){d.setAttribute("${attribute}",t);}else{d.setAttribute("${attribute}","${defaultTheme}");}}catch(e){document.documentElement.setAttribute("${attribute}","${defaultTheme}");}})();`;
}

export const ThemeProvider = ({
  children,
  attribute = "data-theme",
  defaultTheme = "light",
  disableTransitionOnChange = false,
}: ThemeProviderProps) => {
  useServerInsertedHTML(() => (
    <script dangerouslySetInnerHTML={{ __html: themeInitScript(defaultTheme, attribute) }} />
  ));

  const [theme, setThemeState] = React.useState<Theme | undefined>(undefined);

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: Theme = stored === "light" || stored === "dark" ? stored : defaultTheme;
    setThemeState(initial);
    document.documentElement.setAttribute(attribute, initial);
  }, [attribute, defaultTheme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      if (disableTransitionOnChange) {
        const style = document.createElement("style");
        style.appendChild(document.createTextNode("*{transition:none!important}"));
        document.head.appendChild(style);
        requestAnimationFrame(() => document.head.removeChild(style));
      }
      setThemeState(next);
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute(attribute, next);
    },
    [attribute, disableTransitionOnChange],
  );

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
