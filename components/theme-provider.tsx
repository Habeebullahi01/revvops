"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme plumbing for the app. Wrapped rather than used directly so the only
 * place that knows about `next-themes` is this file and the toggle.
 *
 * Two attributes are written on purpose:
 *   `class`      — drives the `.dark` token block and every `dark:` utility.
 *   `data-theme` — a plain attribute the print stylesheet keys off. Print has
 *                  to force the light tokens even while `.dark` is on <html>,
 *                  and it cannot win on specificity OR order: Tailwind hoists
 *                  `@layer base` to the top of the bundle, and the real `.dark`
 *                  block is emitted in a later cascade layer, so an earlier
 *                  layer loses no matter how specific its selector. Selector
 *                  tricks do not survive minification either — Lightning CSS
 *                  collapses `:root:root.dark` to `.dark`. The attribute is
 *                  stable through the build and needs no guessing about which
 *                  class is on <html>; the print block in app/globals.css
 *                  carries `!important`, the one thing layer order cannot
 *                  override. See that block for the full reasoning.
 *
 * `disableTransitionOnChange` stops every var-driven colour from animating at
 * once when the theme flips. `enableSystem` is off deliberately: the sheet is a
 * workshop-facing surface and the default is light, so the theme is an explicit
 * choice by the operator rather than an OS reading.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute={["class", "data-theme"]}
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
