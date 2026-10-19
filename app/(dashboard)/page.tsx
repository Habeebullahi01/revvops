import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROLE_LANDING } from "@/lib/types";

/** Root path: send each role to its landing page (PRD §8.2 / §3 matrix). */
// Reads the session cookie → must render at request time.
export const instant = false;
export default async function Home() {
  const { profile } = await requireUser();
  redirect(ROLE_LANDING[profile.role]);
}
