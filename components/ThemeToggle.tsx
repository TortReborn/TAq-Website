"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle({ dark, setDark }: { dark: boolean, setDark: (d: boolean) => void }) {
  // On mount, read theme from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") setDark(true);
    if (stored === "light") setDark(false);
  }, [setDark]);

  // Whenever theme changes, save to localStorage
  useEffect(() => {
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="fixed top-6 right-8 z-50">
      <button
        className={
          "relative w-16 h-8 rounded-full border flex items-center transition-colors duration-300 " +
          (dark
            ? "bg-ocean-900 border-ocean-700"
            : "bg-ocean-100 border-ocean-300")
        }
        onClick={() => setDark(!dark)}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {/* Sun and Moon icons always rendered for smooth transition */}
        <span className={
          "absolute left-2 text-lg pointer-events-none z-10 transition-opacity duration-2000 " +
          (dark ? "text-blue-200 opacity-100" : "text-blue-200 opacity-0")
        }>🌙</span>
        <span className={
          "absolute right-2 text-lg pointer-events-none z-10 transition-opacity duration-2000 " +
          (dark ? "text-yellow-400 opacity-0" : "text-yellow-400 opacity-100")
        }>☀️</span>
        {/* Sliding circle */}
        <span
          className={
            "absolute top-1 w-6 h-6 rounded-full shadow border transition-transform duration-2000 z-0 " +
            (dark
              ? "bg-ocean-800 border-ocean-700 transform translate-x-[2.25rem]"
              : "bg-white border-ocean-300 transform translate-x-[0.25rem]")
          }
        />
      </button>
    </div>
  );
}
