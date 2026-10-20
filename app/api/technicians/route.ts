import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Active technicians, for the assignment dropdown on job-order forms. */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "technician")
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
