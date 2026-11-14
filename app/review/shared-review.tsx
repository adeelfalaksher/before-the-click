"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { nextReviewer } from "@/lib/engine";
import { scenarios, type Choice } from "@/lib/model";
import { reviewIdSchema, tokenSchema, type ReviewResponse } from "@/lib/review-contract";
import { Brand } from "../ui";
import { Reviewers } from "../workspace/approvals";
import { readResponse, shareHeaders } from "../workspace/storage";

export default function SharedReview() {
  const [credentials, setCredentials] = useState<{ id: string; token: string }>();
  const [review, setReview] = useState<ReviewResponse>();
  const [choice, setChoice] = useState<Choice>("approved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const active = review && nextReviewer(review.reviewers);
  const mine = review?.reviewers.find(person => person.id === review.reviewerId);
  const canDecide = Boolean(mine && active?.id === mine.id);

  async function load(value: { id: string; token: string }, method = "GET", signal?: AbortSignal) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reviews?id=" + encodeURIComponent(value.id), {
        method, signal, cache: "no-store", headers: shareHeaders(value.token),
        body: method === "PATCH" ? JSON.stringify({ op: "decide", choice, note }) : undefined
      });
      const parsed = await readResponse(response);
      if (parsed.expired) { setReview(undefined); throw new Error("This review link has closed or expired."); }
      setReview(parsed.value);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "The review could not be loaded.");
    } finally {
      if (!signal?.aborted) { setBusy(false); setLoading(false); }
    }
  }

  useEffect(() => {
    const [id, token, rest] = window.location.hash.slice(1).split(".");
    if (rest || !reviewIdSchema.safeParse(id).success || !tokenSchema.safeParse(token).success) {
      setError("Open the complete review link from the workspace owner.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const value = { id, token };
    setCredentials(value);
    void load(value, "GET", controller.signal);
    return () => controller.abort();
    // The capability in the URL is fixed for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (credentials && canDecide && !busy) void load(credentials, "PATCH");
  }

  return <div className="shared-page">
    <header className="simple-header"><Brand /><Link href="/guide" className="text-link">Field guide <ArrowRight size={16} /></Link></header>
    <main id="main-content" className="shared-main page-width">
      <div className="section-kicker">SHARED APPROVAL</div>
      <h1>{review?.packet.title ?? "Review a rehearsal"}</h1>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {loading && <p role="status">Opening review…</p>}
      {!review && !loading && credentials && <button className="button secondary" disabled={busy} onClick={() => void load(credentials)}><RefreshCw size={15} /> Retry</button>}
      {review && <>
        <p className="lede">{review.packet.objective}</p>
        <div className="approval-layout">
          <div className="approval-backdrop"><section className="approval-paper">
            <div className="approval-title"><div className="approval-icon"><Clock3 size={20} /></div><div>
              <h2>{canDecide ? mine?.name === "You" ? "It’s your turn" : "It’s your turn, " + mine?.name : mine?.status !== "pending" ? "Your decision is recorded" : "Waiting for an earlier review"}</h2>
              <p>{scenarios[review.packet.scenario].label} · {review.reviewers.filter(person => person.status === "approved").length} of {review.reviewers.length} approved</p>
            </div></div>
            <div className="ordered-label">Review in order</div>
            <Reviewers reviewers={review.reviewers} />
            {canDecide ? <form className="decision-panel" onSubmit={submit}>
              <div><strong>What should happen next?</strong><p>Review the proposed actions before making a decision.</p></div>
              <div className="decision-fields">
                <label className="field">Decision<select value={choice} onChange={event => setChoice(event.target.value as Choice)}>
                  <option value="approved">Approve</option><option value="changes">Request changes</option><option value="rejected">Reject</option>
                </select></label>
                <label className="field">Review note<input maxLength={500} required={choice !== "approved"}
                  placeholder={choice === "approved" ? "Optional" : "Explain your decision"} value={note} onChange={event => setNote(event.target.value)} /></label>
              </div>
              <button className="button dark" disabled={busy}>Record decision <ArrowRight size={16} /></button>
            </form> : <div className="button-row shared-refresh"><button className="button secondary" disabled={busy} onClick={() => credentials && void load(credentials)}><RefreshCw size={16} /> Refresh review</button></div>}
          </section></div>
          <aside className="aside-panel"><div className="section-kicker">PROPOSED ACTIONS</div>
            <ul className="shared-actions">{review.packet.actions.map((action, index) => <li key={index}>
              <div><strong>{action.title}</strong><span className={"status-tag " + (action.risk === "High" ? "amber" : "neutral")}>{action.risk} risk</span></div>
              <b>{action.source}</b><p>{action.detail}</p>
            </li>)}</ul>
            <p className="policy-note"><ShieldCheck size={16} /> Effects are rehearsed in the sandbox.</p>
          </aside>
        </div>
      </>}
    </main>
  </div>;
}
