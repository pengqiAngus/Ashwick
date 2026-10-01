export const THEMES = [
  { id: "dark", label: "黑色", className: "dark", colorScheme: "dark" },
  { id: "light", label: "白色", className: "light", colorScheme: "light" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: ThemeId = "dark";

export function resolveThemeId(stored: string | null): ThemeId {
  for (const theme of THEMES) {
    if (theme.id === stored) return theme.id;
  }
  return DEFAULT_THEME;
}

export function themeById(id: ThemeId) {
  for (const theme of THEMES) {
    if (theme.id === id) return theme;
  }
  return THEMES[0];
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  for (const theme of THEMES) {
    root.classList.toggle(theme.className, theme.id === id);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // 隐私模式写不进 localStorage 时，这次会话仍然切主题
  }
}

export function readStoredTheme(): ThemeId {
  try {
    return resolveThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** 绘制前跑：只接受白名单 id，避免把 localStorage 里的字符串写进 class。 */
export function themeBootScript() {
  const themes = THEMES.map((theme) => ({ id: theme.id, className: theme.className }));
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var themes=${JSON.stringify(themes)};var match=themes.find(function(theme){return theme.id===t});if(!match)return;var root=document.documentElement;for(var i=0;i<themes.length;i++){root.classList.toggle(themes[i].className,themes[i].id===match.id)}}catch(e){}})();`;
}
