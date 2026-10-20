import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, license_plate, make, model, year, customer_id")
    .order("license_plate");
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  
  try {
    const body = await request.json();
    const { customer_id, license_plate, make, model, year } = body;
    
    if (!customer_id || !license_plate || !make || !model || !year) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    
    const { data, error } = await supabase
      .from("vehicles")
      .insert({ customer_id, license_plate, make, model, year })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create vehicle" }, { status: 500 });
  }
}
