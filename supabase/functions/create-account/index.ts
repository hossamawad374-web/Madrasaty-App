import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-madrasaty-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip")
    ?? "unknown";
}

function rateLimited(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = getClientIp(req);
  if (rateLimited(ip)) return json({ error: "Too many requests. Please try again later." }, 429);

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Please enter a valid email address." }, 400);
    }
    if (password.length < 6 || password.length > 128) {
      return json({ error: "Password must be between 6 and 128 characters." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!url || !secretKeysRaw || !anonKey) {
      console.error("[create-account] Supabase runtime configuration missing");
      return json({ error: "Authentication service is not configured." }, 500);
    }

    const secretKeys = JSON.parse(secretKeysRaw);
    const secretKey = secretKeys?.default;
    if (!secretKey) {
      console.error("[create-account] Default Supabase secret key missing");
      return json({ error: "Authentication service is not configured." }, 500);
    }

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (createError) {
      const message = createError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered")) {
        return json({ error: "User already registered" }, 409);
      }
      console.error("[create-account] createUser failed:", createError.message);
      return json({ error: "Unable to create account." }, 400);
    }

    const publicClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInError } =
      await publicClient.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.session || !created.user) {
      console.error("[create-account] session creation failed:", signInError?.message ?? "missing session");
      if (created.user?.id) await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Account was created but could not start a secure session." }, 502);
    }

    return json({
      user: {
        id: created.user.id,
        email: created.user.email,
        username: metadata?.username ?? metadata?.full_name ?? email.split("@")[0],
        created_at: created.user.created_at,
        updated_at: created.user.updated_at,
      },
      session: signInData.session,
    });
  } catch (error) {
    console.error("[create-account] unexpected error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Unable to create account." }, 500);
  }
});
