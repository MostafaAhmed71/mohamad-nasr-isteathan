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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller } = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!caller || caller.role !== "ADMIN" || !caller.is_active) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }

    const body = await req.json();
    const allClassStaff = Boolean(body.all_class_staff);
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const userIds = Array.isArray(body.user_ids)
      ? body.user_ids.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];

    let targets: string[] = [];
    if (allClassStaff) {
      const { data, error } = await admin.from("profiles").select("id").eq("role", "CLASS_STAFF");
      if (error) {
        return Response.json({ error: error.message }, { status: 400, headers: cors });
      }
      targets = (data ?? []).map((row) => row.id);
    } else if (userIds.length) {
      targets = userIds.map((id) => id.trim());
    } else if (userId) {
      targets = [userId];
    } else {
      return Response.json({ error: "user_id_required" }, { status: 400, headers: cors });
    }

    const deleted: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of targets) {
      if (id === user.id) {
        failures.push({ id, error: "لا يمكن حذف حسابك الحالي." });
        continue;
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", id)
        .maybeSingle();

      if (!profile) {
        failures.push({ id, error: "الحساب غير موجود." });
        continue;
      }
      if (profile.role !== "CLASS_STAFF" && profile.role !== "GATE_OFFICER") {
        failures.push({ id, error: "يُسمح بحذف حسابات الفصول والمناوبين فقط." });
        continue;
      }

      if (profile.role === "CLASS_STAFF") {
        await admin.from("classes").update({ staff_profile_id: null }).eq("staff_profile_id", id);
        await admin.from("permission_requests").update({ decided_by: null }).eq("decided_by", id);
      }
      await admin.from("push_subscriptions").delete().eq("user_id", id);

      const { error: profileErr } = await admin.from("profiles").delete().eq("id", id);
      if (profileErr) {
        failures.push({ id, error: profileErr.message });
        continue;
      }

      const { error: authErr } = await admin.auth.admin.deleteUser(id);
      if (authErr) {
        failures.push({ id, error: authErr.message });
        continue;
      }

      deleted.push(id);
    }

    return Response.json(
      {
        ok: failures.length === 0,
        deleted_count: deleted.length,
        deleted,
        failures,
      },
      { headers: cors },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: cors },
    );
  }
});
