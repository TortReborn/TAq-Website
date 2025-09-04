"use client";
import "./globals.css";
import type { ReactNode } from "react";
import { useState } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);
  return (
    <html lang="en">
      <body className="min-h-screen text-ocean-900 antialiased">
        {/* Navigation Bar - present on all pages */}
        <nav className="w-full bg-ocean-100 py-4 px-6 flex justify-between items-center shadow-md">
          <div className="flex gap-6">
            <a href="/" className="text-ocean-900 font-bold text-lg hover:text-ocean-700 transition-colors">Home</a>
            <a href="/graid-event" className="text-ocean-900 font-bold text-lg hover:text-ocean-700 transition-colors">Graid Event</a>
            {/* Add more navigation links here as you add more subpages */}
          </div>
          {/* Dark mode toggle pill */}
          <div className="relative flex items-center">
            <button
              type="button"
              aria-label="Toggle dark mode"
              className="relative w-16 h-8 bg-ocean-200 rounded-full flex items-center justify-between px-2 transition-colors duration-300 shadow-inner border border-ocean-300"
              style={{ minWidth: '64px' }}
              onClick={() => setDarkMode((d) => !d)}
            >
              {/* Sun icon */}
              <span className="flex-1 flex justify-center items-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="4" fill="#FBBF24" />
                  <g stroke="#FBBF24" strokeWidth="2">
                    <line x1="10" y1="1" x2="10" y2="3" />
                    <line x1="10" y1="17" x2="10" y2="19" />
                    <line x1="1" y1="10" x2="3" y2="10" />
                    <line x1="17" y1="10" x2="19" y2="10" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="14.36" y1="14.36" x2="15.78" y2="15.78" />
                    <line x1="4.22" y1="15.78" x2="5.64" y2="14.36" />
                    <line x1="14.36" y1="5.64" x2="15.78" y2="4.22" />
                  </g>
                </svg>
              </span>
              {/* Moon icon */}
              <span className="flex-1 flex justify-center items-end" style={{ alignItems: 'flex-end' }}>
                <svg width="32.5" height="32.5" viewBox="0 0 32.5 32.5" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'translate(-2px, 0px) scale(1.25)' }}>
                  <path d="M25.625 23.125C23.125 23.125 21.25 21.25 21.25 18.75C21.25 16.25 23.125 14.375 25.625 14.375C26.375 14.375 27.125 14.5 27.75 14.75C27.125 11.5 24.5 9 21.25 9C17.125 9 13.75 12.375 13.75 16.5C13.75 20.625 17.125 24 21.25 24C22.75 24 24.25 23.625 25.375 22.875C25.5 23 25.5625 23.125 25.625 23.125Z" fill="#F9FAFB" stroke="#A3A3A3" strokeWidth="1.875" />
                </svg>
              </span>
              {/* Sliding white circle (toggle indicator) */}
              <span
                className="absolute left-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-300"
                style={{ top: '3px', transform: darkMode ? 'translateX(0px)' : 'translateX(32px)' }}
              />
            </button>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
