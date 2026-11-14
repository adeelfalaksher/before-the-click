"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown, Circle, Clock3, Link2, MessageSquare, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { describeAction, newReviewer, nextReviewer, restartReview } from "@/lib/engine";
import { actionLabels, phase, phaseLabels, riskFor, scenarios, type Action, type Choice, type Reviewer, type Run } from "@/lib/model";
import Dialog from "./dialog";
import type { Share } from "./storage";

export function Status({ run }: { run: Run }) {
  const current = phase(run);
  const tone = current === "completed" || current === "ready" ? "green" :
    current === "changes" || current === "rejected" ? "red" : current === "review" ? "amber" : "neutral";
  return <span className={"status-tag " + tone}><i />{phaseLabels[current]}</span>;
}

export function Reviewers({ reviewers, canManage = false, onChange }: {
  reviewers: Reviewer[]; canManage?: boolean; onChange?: (reviewers: Reviewer[]) => void;
}) {
  const active = nextReviewer(reviewers);
  return <div className="reviewer-list">
    {reviewers.map((person, index) => {
      const isActive = person.id === active?.id;
      const label = person.status === "approved" ? "Approved" : person.status === "changes" ? "Changes requested" :
        person.status === "rejected" ? "Rejected" : isActive ? "Awaiting review" : "Waiting in order";
      const tone = person.status === "approved" ? "green" : person.status !== "pending" ? "red" : isActive ? "amber" : "neutral";
      function shift(offset: number) {
        const copy = [...reviewers];
        [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
        onChange?.(copy);
      }
      return <div className={"reviewer-row" + (isActive ? " active" : "")} key={person.id}>
        <span className={"avatar avatar-" + (index % 4)}>{person.name.split(/\s+/).slice(0, 2).map(word => [...word][0]?.toUpperCase()).join("")}</span>
        <div className="reviewer-info">
          <div><b>{person.name}</b>{person.role && <small>{person.role}</small>}</div>
          {person.instructions && <p>{person.instructions}</p>}
          {person.note && <p className="reviewer-note"><MessageSquare size={13} /> {person.note}</p>}
        </div>
        <span className={"status-tag " + tone}>{label}{tone === "green" ? <Check size={13} /> : isActive ? <Clock3 size={13} /> : <Circle size={11} />}</span>
        {canManage && <div className="reviewer-tools">
          <button className="icon-button" aria-label={"Move " + person.name + " up"} disabled={index === 0} onClick={() => shift(-1)}><ArrowUp size={14} /></button>
          <button className="icon-button" aria-label={"Move " + person.name + " down"} disabled={index === reviewers.length - 1} onClick={() => shift(1)}><ArrowDown size={14} /></button>
          <button className="icon-button" aria-label={"Remove " + person.name} disabled={reviewers.length <= 1} onClick={() => onChange?.(reviewers.filter(item => item.id !== person.id))}><Trash2 size={14} /></button>
        </div>}
      </div>;
    })}
  </div>;
}

export default function Approvals({ run, share, busy, onUpdate, onDecision, onMap, onShare, onRefresh, onCloseShare }: {
  run: Run; share?: Share; busy: boolean; onUpdate: (run: Run) => void; onDecision: (id: string, choice: Choice, note: string) => void;
  onMap: () => void; onShare: () => void; onRefresh: () => void; onCloseShare: () => void;
}) {
  const current = phase(run);
  const active = nextReviewer(run.reviewers);
  const approved = run.reviewers.filter(reviewer => reviewer.status === "approved").length;
  const [details, setDetails] = useState(true);
  const [managing, setManaging] = useState(false);
  const [modal, setModal] = useState<"reviewer" | "revision" | null>(null);
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<Choice>("approved");
  const [formError, setFormError] = useState("");
  const editable = !share && !run.result && !run.archivedAt;
  const heading = current === "review" ? "Waiting on " + (active?.name === "You" ? "your review" : active?.name ?? "team review") :
    current === "ready" ? "Ready to run the simulation" : phaseLabels[current];
  function changeReviewers(reviewers: Reviewer[]) {
    const pendingOnly = run.reviewers.every(person => person.status === "pending");
    onUpdate(pendingOnly ? { ...run, reviewers, updatedAt: new Date().toISOString() }
      : restartReview(run, run.objective, run.actions, reviewers));
  }
  function addReviewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (run.reviewers.length >= 8) throw new Error("The approval queue supports up to eight people.");
      const person = newReviewer(String(form.get("name") || ""), String(form.get("role") || ""), String(form.get("instructions") || ""));
      changeReviewers([...run.reviewers, person]);
      setModal(null);
    } catch (error) { setFormError((error as Error).message); }
  }

  return <div className="approval-layout">
    <div className="approval-backdrop">
      <section className="approval-paper" aria-labelledby="queue-title">
        <div className="approval-title"><div className="approval-icon"><Clock3 size={20} /></div><div>
          <h2 id="queue-title">{heading}</h2>
          <p>{approved} of {run.reviewers.length} approved{current === "review" && active ? " · " + active.name + (active.name === "You" ? " are up next" : " is up next") : ""}</p>
        </div><Status run={run} /></div>
        <div className="section-rule"><button type="button" className="bare" aria-expanded={details} aria-controls="approval-steps" onClick={() => setDetails(!details)}>
          {details ? "Collapse details" : "Expand details"} <ChevronDown size={14} className={details ? "rotate" : ""} />
        </button></div>
        <div id="approval-steps" hidden={!details}>
          <div className="queue-stage"><b>Prepare request</b><span>{scenarios[run.scenario].label}</span><small><Check size={14} /> Complete</small></div>
          <div className="queue-stage"><b>Review</b><span>Approval queue</span><small>{approved} of {run.reviewers.length} approved</small></div>
          <div className="ordered-label">Review in order</div>
          <Reviewers reviewers={run.reviewers} canManage={editable && managing} onChange={changeReviewers} />
          {editable && <div className="queue-buttons">
            <button className="button secondary compact" disabled={run.reviewers.length >= 8} onClick={() => { setFormError(""); setModal("reviewer"); }}><Plus size={15} /> Add reviewer</button>
            {run.reviewers.length > 1 && <button className="bare" onClick={() => setManaging(!managing)}>{managing ? "Done editing order" : "Edit order"}</button>}
          </div>}
          <div className="queue-stage"><b>Run simulation</b><span>Sandbox</span><small>{run.result ? "Complete" : current === "ready" ? "Ready" : "Pending approval"}</small></div>
          <div className="queue-stage"><b>Archive result</b><span>History</span><small>{run.archivedAt ? "Archived" : run.result ? "Ready to archive" : "After simulation"}</small></div>
        </div>
        {current === "review" && active && !share && <form className="decision-panel" onSubmit={event => {
          event.preventDefault();
          onDecision(active.id, choice, note);
        }} key={active.id}>
          <div><strong>Record {active.name === "You" ? "your" : active.name + "’s"} decision</strong><p>Check the proposed actions before you continue.</p></div>
          <div className="decision-fields">
            <label className="field">Decision<select value={choice} onChange={event => setChoice(event.target.value as Choice)}>
              <option value="approved">Approve</option><option value="changes">Request changes</option><option value="rejected">Reject</option>
            </select></label>
            <label className="field">Review note {choice === "approved" && <span className="field-hint">optional</span>}
              <input required={choice !== "approved"} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Add context for the next reviewer" />
            </label>
          </div>
          <button type="submit" className="button dark compact">{choice === "approved" ? "Approve and continue" : "Record decision"} <ArrowRight size={15} /></button>
        </form>}
        {share && <div className="decision-panel shared-status">
          <div><strong>{share.published ? "Review links are active" : "Finish creating review links"}</strong>
            <p>{share.published ? "Reviewers record decisions through their individual links." : "Retry to create the same set of links."}</p></div>
          <div className="button-row">
            <button className="button secondary compact" disabled={busy} onClick={onShare}><Link2 size={15} /> {share.published ? "View links" : "Retry share"}</button>
            {share.published && <button className="button secondary compact" disabled={busy} onClick={onRefresh}><RefreshCw size={15} /> Refresh decisions</button>}
            <button className="bare" disabled={busy} onClick={onCloseShare}>{share.published ? "Close links" : "Cancel sharing"}</button>
          </div>
        </div>}
        {current === "review" && !share && <div className="queue-share">
          <button className="bare" disabled={busy} onClick={onShare}><Link2 size={16} /> Share for review</button>
        </div>}
      </section>
    </div>
    <aside className="approval-aside">
      <div className="aside-panel">
        <div className="section-kicker">THE REQUEST</div><h3>{run.title}</h3><p>{run.objective}</p>
        <div className="packet-actions">
          {run.actions.map(action => {
            const source = run.sources.find(item => item.id === action.target)!;
            return <div key={action.id}><span>{action.label || actionLabels[action.kind].title}<small>{source.title}</small></span>
              <span className={"status-tag " + (action.enabled ? (riskFor(action, source) === "High" ? "amber" : "neutral") : "neutral")}>
                {action.enabled ? riskFor(action, source) : "Excluded"}
              </span></div>;
          })}
        </div>
        <div className="button-row">
          <button className="button secondary compact" onClick={onMap}>Inspect on map <ArrowRight size={15} /></button>
          {editable && <button className="bare" onClick={() => setModal("revision")}>Revise plan</button>}
        </div>
      </div>
      <div className="aside-foot"><ShieldCheck size={18} /><p>Sandbox rules are checked after approval, before each action is applied.</p></div>
    </aside>
    {modal === "reviewer" && <Dialog title="Add a reviewer" onClose={() => setModal(null)}>
      <form className="dialog-body stack" onSubmit={addReviewer}>
        <label className="field">Name <input name="name" required maxLength={60} autoFocus /></label>
        <label className="field">Role <input name="role" maxLength={60} placeholder="e.g. Operations" /></label>
        <label className="field">Instructions <textarea name="instructions" rows={3} maxLength={240} placeholder="What should they check?" /></label>
        <p className="field-hint">New reviewers go at the end. Editing a queue with decisions restarts the review.</p>
        {formError && <p className="inline-error" role="alert">{formError}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button dark"><Plus size={16} /> Add reviewer</button></div>
      </form>
    </Dialog>}
    {modal === "revision" && <Revision run={run} onClose={() => setModal(null)} onSave={value => { onUpdate(value); setModal(null); }} />}
  </div>;
}

function Revision({ run, onSave, onClose }: { run: Run; onSave: (run: Run) => void; onClose: () => void }) {
  const [goal, setGoal] = useState(run.objective);
  const [actions, setActions] = useState<Action[]>(run.actions);
  const [error, setError] = useState("");
  return <Dialog title="Revise the plan" onClose={onClose}><form className="dialog-body stack" onSubmit={event => {
    event.preventDefault();
    try {
      if (new Set(actions.map(action => action.kind + ":" + action.target)).size !== actions.length) {
        throw new Error("Choose a different operation or source for each action.");
      }
      onSave(restartReview(run, goal, actions));
    } catch (caught) { setError((caught as Error).message); }
  }}>
    <label className="field">Rehearsal goal<textarea rows={3} value={goal} maxLength={1200} required onChange={event => setGoal(event.target.value)} /></label>
    <fieldset className="revision-options"><legend>Proposed actions</legend>{actions.map((action, index) => <div className="revision-action" key={action.id}>
      <label className="check-label"><input type="checkbox" aria-label={"Include action " + (index + 1)} checked={action.enabled} onChange={event => {
        setActions(actions.map(item => item.id === action.id ? { ...item, enabled: event.target.checked } : item));
      }} /> {describeAction(run, action)}</label>
      <div className="decision-fields">
        <label className="field">Operation<select value={action.kind} onChange={event => {
          const kind = event.target.value as Action["kind"];
          setActions(actions.map(item => item.id === action.id ? { ...item, kind, label: undefined, detail: undefined } : item));
        }}>{scenarios[run.scenario].allowed.map(kind => <option key={kind} value={kind}>{actionLabels[kind].title}</option>)}</select></label>
        <label className="field">Source<select value={action.target} onChange={event => {
          setActions(actions.map(item => item.id === action.id ? { ...item, target: event.target.value, label: undefined, detail: undefined } : item));
        }}>{run.sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
      </div>
    </div>)}</fieldset>
    <p className="field-hint">Saving sends the revised plan to the first reviewer.</p>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button dark">Save revision <ArrowRight size={16} /></button></div>
  </form></Dialog>;
}
