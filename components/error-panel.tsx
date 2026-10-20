import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Shared sheet behind the error routes (404, 500, …): the status code in mono,
 * a plain-language explanation and a way out. Rendered both bare, in the root
 * layout, and inside the dashboard frame — so it centres itself rather than
 * assuming a full viewport.
 */
export function ErrorPanel({
  code,
  title,
  body,
  secondary,
  digest,
}: {
  code: string;
  title: string;
  body: string;
  /** Extra action rendered beside "Back to home". */
  secondary?: ReactNode;
  /** Server error digest — surfaced so a report can be matched to logs. */
  digest?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-14 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.35em] text-muted-foreground uppercase">
        {code}
      </p>

      <div className="w-full rounded-xl border border-border bg-card p-6 text-left shadow-xs sm:p-8">
        <h1 className="text-title font-semibold text-balance">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={cn(buttonVariants(), "sm:flex-1")}>
            Back to home
          </Link>
          {secondary}
        </div>

        {digest && (
          <p className="mt-4 border-t border-rule pt-3 font-mono text-xs break-all text-muted-foreground">
            Reference {digest}
          </p>
        )}
      </div>
    </div>
  );
}
