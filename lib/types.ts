export const ROLES = ["admin", "manager", "reception", "technician"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Where each role lands after login / on the root path (PRD §8.2). */
export const ROLE_LANDING: Record<Role, string> = {
  admin: "/dashboard",
  manager: "/dashboard",
  reception: "/job-orders",
  technician: "/technician",
};
