import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: cors });
}

function normalizeWhatsAppNumber(raw: string): string | null {
  let value = String(raw ?? "").trim().replace(/[^\d+]/g, "");
  if (value.startsWith("00")) value = value.slice(2);
  if (value.startsWith("+")) value = value.slice(1);
  value = value.replace(/\D/g, "");
  if (!value) return null;
  if (value.startsWith("966") && value.length >= 12) return value.slice(0, 12);
  if (value.startsWith("20") && value.length >= 11) return value;
  if (value.startsWith("05") && value.length === 10) return `966${value.slice(1)}`;
  if (value.startsWith("5") && value.length === 9) return `966${value}`;
  if (value.startsWith("01") && value.length >= 10) return `20${value.slice(1)}`;
  if (value.startsWith("0") && value.length >= 9) return `966${value.slice(1)}`;
  return value.length >= 10 ? value : null;
}

const GRADE: Record<number, string> = {
  1: "الأول المتوسط",
  2: "الثاني المتوسط",
  3: "الثالث المتوسط",
  4: "الأول الثانوي",
  5: "الثاني الثانوي",
  6: "الثالث الثانوي",
};

function riyadhWeekday(at = new Date()) {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
  }).format(at);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? at.getDay();
}

async function loadSupervisor(
  admin: ReturnType<typeof createClient>,
  opts: { grade: number; classId?: string | null },
): Promise<{ name: string; phone: string } | null> {
  if (opts.grade >= 1 && opts.grade <= 3) {
    if (!opts.classId) return null;
    const { data } = await admin
      .from("supervisor_class_contacts")
      .select("supervisor_name, whatsapp_number")
      .eq("class_id", opts.classId)
      .maybeSingle();
    if (!data) return null;
    return {
      name: String(data.supervisor_name ?? ""),
      phone: String(data.whatsapp_number ?? ""),
    };
  }
  if (opts.grade >= 4 && opts.grade <= 6) {
    const { data } = await admin
      .from("supervisor_daily_roster")
      .select("supervisor_name, whatsapp_number")
      .eq("grade", opts.grade)
      .eq("weekday", riyadhWeekday())
      .maybeSingle();
    if (!data) return null;
    return {
      name: String(data.supervisor_name ?? ""),
      phone: String(data.whatsapp_number ?? ""),
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const gatewayUrl = (Deno.env.get("WHATSAPP_GATEWAY_URL") || "").replace(/\/$/, "");
    const gatewaySecret = Deno.env.get("WHATSAPP_GATEWAY_SECRET") || "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = profile?.role as string | undefined;
    if (!role || !["GATE_OFFICER", "CLASS_STAFF", "ADMIN"].includes(role)) {
      return json({ error: "forbidden" }, 403);
    }

    const body = await req.json();
    const requestId = String(body.request_id ?? "").trim();
    const event = body.event === "decision" ? "decision" : "created";
    if (!requestId) return json({ error: "request_id_required" }, 400);

    const { data: request, error: reqErr } = await admin
      .from("permission_requests")
      .select(
        "id, status, reason, rejection_reason, created_by, class_id, created_at, students(full_name, grade, classes(section)), classes(grade, section), profiles:created_by(full_name, phone)",
      )
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr || !request) return json({ error: "request_not_found" }, 404);

    if (event === "created" && role === "GATE_OFFICER" && request.created_by !== user.id) {
      return json({ error: "forbidden" }, 403);
    }
    if (event === "created" && role === "CLASS_STAFF") return json({ error: "forbidden" }, 403);
    if (event === "decision" && role === "GATE_OFFICER") return json({ error: "forbidden" }, 403);

    if (!gatewayUrl) {
      return json({ ok: false, sent: 0, error: "gateway_not_configured" });
    }

    const student = request.students as { full_name?: string; grade?: number; classes?: { section?: string } } | null;
    const cls = request.classes as { grade?: number; section?: string } | null;
    const gateOfficer = request.profiles as { full_name?: string; phone?: string | null } | null;
    const grade = student?.grade ?? cls?.grade ?? 0;
    const section = student?.classes?.section ?? cls?.section ?? "";
    const studentName = student?.full_name ?? "الطالب";
    const gateOfficerName = gateOfficer?.full_name ?? "مناوب البوابة";

    type Job = { recipientType: string; messageType: string; phone: string; text: string };
    const jobs: Job[] = [];

    if (event === "created" && request.status === "PENDING") {
      const supervisor = await loadSupervisor(admin, {
        grade,
        classId: (request as { class_id?: string }).class_id,
      });
      if (supervisor) {
        jobs.push({
          recipientType: "SUPERVISOR",
          messageType: "REQUEST_CREATED",
          phone: supervisor.phone,
          text: [
            "طلب خروج جديد",
            "",
            `الطالب: ${studentName}`,
            `الصف: ${GRADE[grade] ?? grade}`,
            `الفصل: ${section}`,
            "",
            `مناوب البوابة: ${gateOfficerName}`,
            "",
            "سبب الخروج:",
            (request.reason || "").trim() || "بدون سبب",
            "",
            `وقت الطلب: ${request.created_at}`,
            "",
            "يرجى الدخول إلى نظام خروج لمراجعة الطلب.",
          ].join("\n"),
        });
      }
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      const { data: existing } = await admin
        .from("whatsapp_notifications")
        .select("id, status")
        .eq("permission_request_id", requestId)
        .eq("message_type", job.messageType)
        .eq("recipient_type", job.recipientType)
        .maybeSingle();
      if (existing?.status === "sent") {
        skipped += 1;
        continue;
      }

      const digits = normalizeWhatsAppNumber(job.phone);
      if (!digits) {
        if (!existing) {
          await admin.from("whatsapp_notifications").insert({
            permission_request_id: requestId,
            recipient_type: job.recipientType,
            recipient_phone: "",
            message_type: job.messageType,
            status: "skipped",
            error_message: "missing_or_invalid_phone",
          });
        }
        errors.push("invalid_phone");
        continue;
      }

      if (!existing) {
        await admin.from("whatsapp_notifications").insert({
          permission_request_id: requestId,
          recipient_type: job.recipientType,
          recipient_phone: digits,
          message_type: job.messageType,
          status: "pending",
        });
      }

      const row = await admin
        .from("whatsapp_notifications")
        .select("id, status")
        .eq("permission_request_id", requestId)
        .eq("message_type", job.messageType)
        .eq("recipient_type", job.recipientType)
        .maybeSingle();
      if (row.data?.status === "sent") {
        skipped += 1;
        continue;
      }

      try {
        const res = await fetch(`${gatewayUrl}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(gatewaySecret ? { "X-WhatsApp-Secret": gatewaySecret } : {}),
          },
          body: JSON.stringify({ phone: digits, text: job.text }),
        });
        const payload = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) throw new Error(payload.error || `gateway_${res.status}`);
        await admin.from("whatsapp_notifications").update({
          status: "sent",
          recipient_phone: digits,
          sent_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", row.data!.id);
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "send_failed";
        errors.push(message);
        if (row.data?.id) {
          await admin.from("whatsapp_notifications").update({
            status: "failed",
            recipient_phone: digits,
            error_message: message.slice(0, 500),
          }).eq("id", row.data.id);
        }
      }
    }

    return json({ ok: true, sent, skipped, errors });
  } catch (e) {
    console.error(e);
    return json({
      ok: false,
      sent: 0,
      error: e instanceof Error ? e.message : "unexpected_error",
    });
  }
});
