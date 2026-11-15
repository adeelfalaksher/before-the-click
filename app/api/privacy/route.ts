import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/auth-request";
import { currentAccount } from "@/lib/server-account";
import { reply, requestError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await currentAccount();
    if (!account) return NextResponse.redirect(new URL("/login?next=/privacy", request.url), 303);

    const form = await request.formData();
    const kind = form.get("request");
    if (kind !== "access" && kind !== "deletion") return reply({ error: "Choose a privacy request." }, 400);

    // One pending request of each type per account, even when a form is retried.
    await put(`privacy-requests/${account.id}/${kind}.json`, JSON.stringify({
      accountId: account.id, kind, submittedAt: new Date().toISOString()
    }), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
    return NextResponse.redirect(new URL("/privacy/request-received", request.url), 303);
  } catch (error) {
    return requestError(error);
  }
}
