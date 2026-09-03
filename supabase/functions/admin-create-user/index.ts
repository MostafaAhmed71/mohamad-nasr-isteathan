import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: caller } = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!caller || caller.role !== "ADMIN" || !caller.is_active) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }

    const body = await req.json();
    const role = body.role as string;
    const full_name = String(body.full_name ?? "").trim();
    const password = String(body.password ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!full_name || password.length < 6 || !email) {
      return Response.json({ error: "البريد والاسم وكلمة المرور مطلوبة" }, {
        status: 400,
        headers: cors,
      });
    }

    let national_id: string | null = null
    let username: string | null = body.username
      ? String(body.username).trim().toLowerCase()
      : email.split("@")[0];
    let phone: string | null = body.phone ? String(body.phone) : null;

    if (role === "CLASS_STAFF") {
      if (!body.class_id) {
        return Response.json({ error: "يجب تعيين فصل" }, { status: 400, headers: cors });
      }
    } else if (role === "GATE_OFFICER") {
      if (!username) {
        return Response.json({ error: "username required" }, { status: 400, headers: cors });
      }
    } else if (role !== "ADMIN") {
      return Response.json({ error: "Invalid role" }, { status: 400, headers: cors });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name },
    });
    if (createErr || !created.user) {
      return Response.json({ error: createErr?.message ?? "create failed" }, {
        status: 400,
        headers: cors,
      });
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name,
      role,
      national_id,
      username,
      phone,
      is_active: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return Response.json({ error: profileErr.message }, { status: 400, headers: cors });
    }

    if (role === "CLASS_STAFF" && body.class_id) {
      await admin
        .from("classes")
        .update({ staff_profile_id: null })
        .eq("staff_profile_id", created.user.id);
      await admin
        .from("classes")
        .update({ staff_profile_id: created.user.id })
        .eq("id", body.class_id);
    }

    return Response.json({ ok: true, id: created.user.id, email }, { headers: cors });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: cors },
    );
  }
});
