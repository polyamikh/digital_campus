"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

type CampusTheme = "dark" | "light";

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("digital-campus-theme-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("digital-campus-theme-change", onStoreChange);
  };
}

function getThemeSnapshot(): CampusTheme {
  return window.localStorage.getItem("digital-campus-theme") === "light" ? "light" : "dark";
}

function getServerThemeSnapshot(): CampusTheme {
  return "dark";
}

export default function CampusThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  useLayoutEffect(() => {
    document.documentElement.dataset.campusTheme = theme;
  }, [theme]);

  function toggleTheme() {
    const next: CampusTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.campusTheme = next;
    window.localStorage.setItem("digital-campus-theme", next);
    window.dispatchEvent(new Event("digital-campus-theme-change"));
  }

  return <button className="campus-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Включить ${theme === "dark" ? "светлую" : "тёмную"} тему`} aria-pressed={theme === "light"} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {theme === "dark" ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></> : <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.7 8.7 0 1 0 20.5 15.2Z"/>}
    </svg><span>{theme === "dark" ? "Светлая" : "Тёмная"}</span>
  </button>;
}
