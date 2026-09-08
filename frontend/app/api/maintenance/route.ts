import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure the user is a tenant
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'tenant') {
       return NextResponse.json({ error: "Only tenants can log maintenance requests" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, priority, property_id } = body;

    if (!title || !description || !property_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // INTELLIGENT ROUTING LOGIC
    // Determine who handles the request based on the property's subscription tier
    const { data: property, error: propertyError } = await supabase
       .from('properties')
       .select('subscription_tier')
       .eq('id', property_id)
       .single();

    if (propertyError || !property) {
       return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    let routedTo = 'landlord'; // Default for 'basic' tier
    if (property.subscription_tier === 'managed') {
       routedTo = 'agent';
    } else if (property.subscription_tier === 'full_service') {
       routedTo = 'admin'; // EasyRent handles it
    }

    // Insert the request
    const { data: request, error: insertError } = await supabase
      .from("maintenance_requests")
      .insert([
        {
          tenant_id: user.id,
          property_id,
          title,
          description,
          priority: priority || 'low',
          status: 'pending',
          routed_to: routedTo
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert maintenance request:", insertError);
      return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
    }

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
