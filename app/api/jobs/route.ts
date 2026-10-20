import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
