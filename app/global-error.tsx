"use client";

// global-error replaces the root layout, so it brings its own styles,
// font and document shell with it.
import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";
import { buttonVariants } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { ErrorPanel } from "@/components/error-panel";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest =
    typeof error === "object" && error && "digest" in error
      ? (error as { digest?: unknown }).digest
      : undefined;

  return (
    <html lang="en" className={`${plexSans.variable} h-full antialiased`}>
      <title>Something went wrong · Workshop Management System</title>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <main className="flex min-h-dvh w-full flex-col justify-center">
          <ErrorPanel
            code="500"
            title="The workshop app could not start"
            body="This is a failure of the application shell itself, not of your data. Reload the page, and if it happens again, tell the administrator."
            digest={typeof digest === "string" ? digest : undefined}
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
      </body>
    </html>
  );
}
