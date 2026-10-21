"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme plumbing for the app. Wrapped rather than used directly so the only
 * place that knows about `next-themes` is this file and the toggle.
 *
 * `attribute="class"` matches the `.dark` selector in app/globals.css;
 * `disableTransitionOnChange` stops every var-driven colour from animating at
 * once when the theme flips. `enableSystem` is off deliberately: the sheet is
 * a workshop-facing surface and the default is light, so the theme is an
 * explicit choice by the operator rather than an OS reading.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
