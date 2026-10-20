import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * The technician vehicle lens's job feed. Reads `job_orders_tech_view`, not
 * `job_orders`: RLS is row-level, not column-level, so selecting from the
 * real table would hand a technician `estimated_amount` / `billing_type`
 * even though they can see the rows (BUSINESS_RULES.md §5).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicle_id");

  let query = supabase
    .from("job_orders_tech_view")
    .select("*")
    .order("created_at", { ascending: false });

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
