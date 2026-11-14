"use client";

import { useState } from "react";
import Link from "next/link";

export function AcceptInvitation({ token, username }: { token: string; username?: string }) {
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<string>();
  const [error, setError] = useState("");
  const signIn = "/login?" + new URLSearchParams({ next: "/join?token=" + token });

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/api/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "btc_join", d: key })
      });
      if (response.status === 401) {
        window.location.replace(signIn);
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not accept this invitation.");
      setWorkspace(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="bt-form">
    {workspace ? <>
      <p role="status">Invitation accepted. You now have access to this workspace.</p>
      <Link className="bt-primary" href={"/console?" + new URLSearchParams({ workspace })}>Open workspace</Link>
    </> : username ? <>
      <p>Signed in as <strong>@{username}</strong>. Accept the invitation if it was sent to this username.</p>
      {error && <p role="alert" className="bt-alert">{error}</p>}
      <button type="button" className="bt-primary" disabled={busy} onClick={accept}>{busy ? "Accepting…" : "Accept invitation"}</button>
      <Link className="bt-small-link" href={signIn}>Use a different username</Link>
    </> : <>
      <p>Sign in with the username your teammate invited. You’ll return here to accept the invitation.</p>
      <Link className="bt-primary" href={signIn}>Sign in to continue</Link>
    </>}
  </div>;
}
