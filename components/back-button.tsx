"use client";

import { buttonVariants } from "@/components/ui/button";

/** Browser-back action shared by the error pages (needs the client). */
export function BackButton({ label = "Go back" }: { label?: string }) {
  return (
    <button
      type="button"
      className={`${buttonVariants({ variant: "outline" })} sm:flex-1`}
      onClick={() => history.back()}
    >
      {label}
    </button>
  );
}
