"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * GET search bar for the directory pages: submitting replaces the current
 * route with `?q=`, so the server component re-queries. Nothing is fetched
 * until the user asks for it.
 */
export function DirectorySearch({
  path,
  placeholder,
  defaultValue = "",
  hint,
}: {
  path: string;
  placeholder: string;
  defaultValue?: string;
  hint?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = value.trim();
    router.replace(q ? `${path}?q=${encodeURIComponent(q)}` : path);
  };

  const clear = () => {
    setValue("");
    router.replace(path);
  };

  return (
    <form onSubmit={submit} role="search" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search"
            placeholder={placeholder}
            className="ps-8"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {defaultValue && (
          <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label="Clear search">
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </form>
  );
}
