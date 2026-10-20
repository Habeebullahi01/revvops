"use client";

import { RouteError } from "@/components/route-error";

/** Root boundary: catches anything thrown below the root layout. */
export default function RootError(props: {
  error: unknown;
  retry: () => void;
}) {
  return <RouteError {...props} fullPage />;
}
