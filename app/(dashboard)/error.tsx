"use client";

import { RouteError } from "@/components/route-error";

/**
 * Boundary for the dashboard segment, so a failure keeps the sidebar and
 * header instead of dumping the user on a bare page.
 */
export default function DashboardError(props: {
  error: unknown;
  retry: () => void;
}) {
  return <RouteError {...props} />;
}
