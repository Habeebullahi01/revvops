"use client";

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { ErrorPanel } from "@/components/error-panel";

function digestOf(error: unknown): string | undefined {
  if (typeof error === "object" && error && "digest" in error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" && digest ? digest : undefined;
  }
  return undefined;
}

/**
 * The 500 boundary. Client component (React error boundaries have to be), so
 * it renders inside whatever layout is above it — a bare `main` at the root,
 * the dashboard frame when placed under `app/(dashboard)`.
 */
export function RouteError({
  error,
  retry,
  fullPage = false,
}: {
  error: unknown;
  retry: () => void;
  /** true at the root boundary, where nothing frames the panel. */
  fullPage?: boolean;
}) {
  useEffect(() => {
    // In production the message is stripped; the digest matches the server log.
    console.error(error);
  }, [error]);

  return (
    <main
      className={
        fullPage
          ? "flex min-h-dvh w-full flex-col justify-center"
          : "flex flex-col justify-center"
      }
    >
      <ErrorPanel
        code="500"
        title="This screen failed to load"
        body="Something broke while the page was being built. Your data was not changed — try again, and if it keeps happening, tell the administrator what you were doing."
        digest={digestOf(error)}
        secondary={
          <>
            <BackButton />
            <button
              type="button"
              className={`${buttonVariants()} sm:flex-1`}
              onClick={retry}
            >
              Try again
            </button>
          </>
        }
      />
    </main>
  );
}
