import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyCustomJwt(token: string, secret: string): Promise<{ sub: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const secretBytes = new TextEncoder().encode(secret);
    const signingInput = parts[0] + "." + parts[1];
    const key = await crypto.subtle.importKey(
      "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );

    const b64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(signingInput));
    if (!valid) return null;

    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadPadded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
    const payload = JSON.parse(atob(payloadPadded));

    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return { sub: payload.sub };
  } catch {
    return null;
  }
}

async function getAdminAndVerifyCaller(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 };

  const token = authHeader.slice(7);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: jwtConfig } = await adminClient
    .from("jwt_config")
    .select("secret")
    .eq("id", 1)
    .schema("private")
    .maybeSingle();

  if (!jwtConfig?.secret) return { error: "Server configuration error", status: 500 };

  const payload = await verifyCustomJwt(token, jwtConfig.secret);
  if (!payload) return { error: "Unauthorized", status: 401 };

  const { data: orgUser, error: orgErr } = await adminClient
    .from("org_users")
    .select("role, is_active")
    .eq("id", payload.sub)
    .maybeSingle();

  if (orgErr || !orgUser || orgUser.role !== "admin" || !orgUser.is_active) {
    return { error: "Forbidden: admin only", status: 403 };
  }

  return { adminClient, callerId: payload.sub };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "POST") {
      const result = await getAdminAndVerifyCaller(req);
      if ("error" in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { adminClient } = result;
      const { email, password, full_name, role } = await req.json();

      if (!email || !password || !full_name) {
        return new Response(JSON.stringify({ error: "email, password and full_name are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedRoles = ["power_user", "auditor"];
      const resolvedRole = allowedRoles.includes(role) ? role : "auditor";

      const { data, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insertErr } = await adminClient
        .from("org_users")
        .insert({
          id: data.user.id,
          email,
          full_name,
          role: resolvedRole,
          is_active: true,
        });

      if (insertErr) {
        await adminClient.auth.admin.deleteUser(data.user.id);
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: data.user }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const result = await getAdminAndVerifyCaller(req);
      if ("error" in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { adminClient, callerId } = result;
      const { user_id } = await req.json();

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteErr) {
        return new Response(JSON.stringify({ error: deleteErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PATCH") {
      const result = await getAdminAndVerifyCaller(req);
      if ("error" in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { adminClient } = result;
      const { user_id, password } = await req.json();

      if (!user_id || !password) {
        return new Response(JSON.stringify({ error: "user_id and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (password.length < 8) {
        return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
