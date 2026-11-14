import "server-only";
import { createHmac } from "node:crypto";
import { serverSupabase } from "./supabase-server";

export async function authenticated() {
  const supabase = await serverSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

export function signedOperation(userId: string, kind: "proposal" | "connection" | "execution" | "publish", data: unknown) {
  const secret = process.env.BTC_SERVER_SECRET;
  if (!secret) throw new Error("Workflow signing is not configured on the server.");
  const payload = JSON.stringify(data);
  return {
    payload,
    signature: createHmac("sha256", secret).update(userId + ":" + kind + ":" + payload).digest("hex")
  };
}

export function jsonError(error: unknown, fallback = "The request could not be completed.") {
  const raw = error instanceof Error ? error.message : fallback;
  const detail = raw.toLowerCase().includes("secret") ? "Server configuration is incomplete." : raw;
  return Response.json({ error: detail }, { status: 400 });
}
