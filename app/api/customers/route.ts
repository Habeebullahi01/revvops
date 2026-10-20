import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, address")
    .order("name");
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  
  try {
    const body = await request.json();
    const { name, phone, email, address } = body;
    
    if (!name || !phone) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }
    
    const { data, error } = await supabase
      .from("customers")
      .insert({ name, phone, email: email || null, address: address || null })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create customer" }, { status: 500 });
  }
}
