"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Archive, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, Clipboard, Cloud,
  History as HistoryIcon, House, Layers, Link2, Plus, Settings2, ShieldCheck, UsersRound
} from "lucide-react";
import { archiveRun, decide, duplicateRun, makeId, record, simulate, starterRun } from "@/lib/engine";
import { defaultPolicy, phase, scenarios, type Choice, type Policy, type Run, type ScenarioId } from "@/lib/model";
import { randomToken, type ReviewResponse } from "@/lib/review-contract";
import { Brand } from "../ui";
import Approvals, { Status } from "./approvals";
import Dialog from "./dialog";
import History, { Audit, prettyDate } from "./history";
import NewRun, { scenarioIcons } from "./new-run";
import Simulator from "./simulator";
import { downloadJson, encodedBackup, loadWorkspace, maxBackupSize, readBackup, readResponse, saveWorkspace, shareHeaders, type Data, type Share } from "./storage";

const tabs = [
  { id: "overview", label: "Overview", short: "Home", icon: House },
  { id: "review", label: "Approvals", short: "Approvals", icon: UsersRound },
  { id: "map", label: "Simulator", short: "Simulator", icon: Layers },
  { id: "history", label: "History", short: "History", icon: HistoryIcon },
  { id: "policy", label: "Guardrails", short: "Rules", icon: ShieldCheck },
  { id: "settings", label: "Settings", short: "Settings", icon: Settings2 }
] as const;
type View = typeof tabs[number]["id"] | "audit";

const descriptions: Record<View, { title: string; detail: string }> = {
  overview: { title: "Rehearsal workspace", detail: "Create a plan and follow it from request to decision." },
  review: { title: "Action approvals", detail: "Review the request, then record each person’s decision in order." },
  map: { title: "Simulator map", detail: "Inspect each action and see what it changes in the sandbox." },
  history: { title: "Rehearsal history", detail: "Find a saved rehearsal, compare alternatives, or download a record." },
  policy: { title: "Guardrails", detail: "Choose which actions the simulator blocks, even after approval." },
  settings: { title: "Workspace settings", detail: "Move your work between browsers with a backup." },
  audit: { title: "Audit record", detail: "Review the decisions and outcomes for this rehearsal." }
};
const policies: { key: keyof Policy; name: string; info: string }[] = [
  { key: "external", name: "External action protection", info: "Block simulated sends and external file shares." },
  { key: "destructive", name: "File deletion protection", info: "Keep files present when a plan requests deletion." },
  { key: "privacy", name: "Private source protection", info: "Prevent exposure, relocation, or removal of records marked private." }
];

function readView(): View {
  const active = new URLSearchParams(window.location.search).get("view");
  if (active === "guardrails") return "policy";
  if (active === "audit" || tabs.some(tab => tab.id === active)) return active as View;
  return "overview";
}

export default function Workspace() {
  const [data, setData] = useState<Data>({ workflows: [], policy: defaultPolicy, shares: {} });
  const [loaded, setLoaded] = useState(false);
  const [writeEnabled, setWriteEnabled] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [activeId, setActiveId] = useState("");
  const [creating, setCreating] = useState(false);
  const [startingScenario, setStartingScenario] = useState<ScenarioId>("inbox");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);
  const info = descriptions[view];
  const fileInput = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  const run = data.workflows.find(item => item.id === activeId) ?? data.workflows[0];
  const share = run ? data.shares[run.id] : undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const restoreLocation = () => {
      setView(readView());
      const url = new URLSearchParams(window.location.search);
      setActiveId(url.get("run") || "");
      setCreating(url.get("new") === "1");
    };
    restoreLocation();
    try {
      const existing = loadWorkspace();
      const initial = existing ?? { workflows: [starterRun()], policy: defaultPolicy, shares: {} };
      dataRef.current = initial;
      setData(initial);
      setActiveId(params.get("run") || initial.workflows[0]?.id || "");
      saveWorkspace(initial);
    } catch {
      setWriteEnabled(false);
      setStorageError("Your saved workspace could not be loaded. Import a backup to restore access.");
    }
    setLoaded(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== "before-the-click.workspace.v2") return;
      try {
        const current = loadWorkspace();
        if (current) {
          dataRef.current = current;
          setData(current);
        }
      } catch { setStorageError("A change in another tab could not be loaded."); }
    };
    window.addEventListener("popstate", restoreLocation);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("popstate", restoreLocation);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function updateData(transform: (current: Data) => Data, restore = false) {
    const updated = transform(dataRef.current);
    if (writeEnabled || restore) {
      try { saveWorkspace(updated); setStorageError(""); }
      catch {
        setStorageError("This browser could not save the change. Download a backup before leaving.");
      }
    }
    dataRef.current = updated;
    setData(updated);
  }
  function route(next: View, id = run?.id) {
    setView(next);
    setError("");
    setLinks(false);
    if (id) setActiveId(id);
    const url = new URL(window.location.href);
    url.search = "";
    if (next !== "overview") url.searchParams.set("view", next);
    if (id && next !== "overview") url.searchParams.set("run", id);
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  }
  function openNew(scenario: ScenarioId = "inbox") {
    setStartingScenario(scenario);
    setCreating(true);
  }
  function dismissNew() {
    setCreating(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("new")) {
      url.searchParams.delete("new");
      window.history.replaceState(null, "", url);
    }
  }
  function showError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : "The workspace could not complete the action.");
  }
  function updateRun(value: Run) {
    setError("");
    updateData(current => ({ ...current, workflows: current.workflows.map(item => item.id === value.id ? value : item) }));
  }
  function addRun(value: Run) {
    if (dataRef.current.workflows.length >= 50) throw new Error("This workspace holds 50 rehearsals. Export a backup and import the records you want to keep.");
    updateData(current => ({ ...current, workflows: [value, ...current.workflows] }));
    dismissNew();
    route("review", value.id);
    setNotice("Rehearsal created.");
  }
  function localDecision(id: string, choice: Choice, note: string) {
    if (!run || share) return;
    try {
      updateRun(decide(run, id, choice, note));
      setNotice("Decision recorded.");
    } catch (caught) { showError(caught); }
  }
  function runSimulation() {
    if (!run) return;
    try {
      const latest = dataRef.current.workflows.find(item => item.id === run.id) ?? run;
      updateRun(simulate(latest, dataRef.current.policy));
      setNotice("Simulation complete.");
      route("audit", run.id);
    } catch (caught) { showError(caught); }
  }
  function runArchive() {
    if (!run) return;
    try {
      updateRun(archiveRun(run));
      setNotice("Rehearsal archived.");
    } catch (caught) { showError(caught); }
  }
  function copyRun(value: Run) {
    try { addRun(duplicateRun(value)); }
    catch (caught) { showError(caught); }
  }
  function applyReview(runId: string, value: ReviewResponse, remove = false) {
    updateData(current => {
      const shares = { ...current.shares };
      if (remove) delete shares[runId];
      return {
        ...current, shares, workflows: current.workflows.map(item => {
          if (item.id !== runId || item.result || item.archivedAt) return item;
          const known = new Map(item.reviewers.map(person => [person.id, person]));
          const decisions = value.reviewers.filter(person => person.status !== "pending" && known.get(person.id)?.status === "pending");
          if (!decisions.length) return item;
          let output = { ...item, reviewers: value.reviewers };
          for (const person of decisions) {
            const decision = person.status === "approved" ? "Approved the shared plan." :
              person.status === "changes" ? "Requested changes to the shared plan." : "Rejected the shared plan.";
            output = record(output, decision, person.name, person.decidedAt ?? undefined);
          }
          return { ...output, updatedAt: new Date().toISOString() };
        })
      };
    });
  }
  async function publishLinks() {
    if (!run || busy) return;
    if (share?.published) { setLinks(true); return; }
    setBusy(true);
    setError("");
    const { legacyAudit, activity, ...packet } = run;
    const pending = share ?? {
      id: makeId(), ownerToken: randomToken(), published: false,
      invites: run.reviewers.filter(person => person.status === "pending").map(person => ({ id: person.id, token: randomToken() }))
    };
    updateData(current => ({ ...current, shares: { ...current.shares, [run.id]: pending } }));
    try {
      const response = await fetch("/api/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pending, run: {
          ...packet, activity: [],
          sources: packet.sources.map(source => source.sensitive
            ? { ...source, title: "Private source", detail: "" } : source)
        } })
      });
      const parsed = await readResponse(response);
      if (parsed.expired) throw new Error("This set of links has expired. Create a new set.");
      updateData(current => ({ ...current, shares: {
        ...current.shares, [run.id]: { ...pending, published: true, expiresAt: parsed.value.expiresAt }
      } }));
      applyReview(run.id, parsed.value);
      setLinks(true);
    } catch (caught) { showError(caught); }
    finally { setBusy(false); }
  }
  async function refreshReview(close = false) {
    if (!run || !share || busy) return;
    setBusy(true);
    setError("");
    try {
      const options: RequestInit = { cache: "no-store", headers: shareHeaders(share.ownerToken) };
      if (close) {
        options.method = "PATCH";
        options.body = JSON.stringify({ op: "close" });
      }
      const response = await fetch("/api/reviews?id=" + encodeURIComponent(share.id), options);
      if (response.status === 404 && close && !share.published) {
        updateData(current => {
          const shares = { ...current.shares };
          delete shares[run.id];
          return { ...current, shares };
        });
        setNotice("Sharing canceled.");
        return;
      }
      const parsed = await readResponse(response);
      if (parsed.expired) {
        updateData(current => {
          const shares = { ...current.shares };
          delete shares[run.id];
          return { ...current, shares };
        });
        setLinks(false);
        setNotice("The review links expired. You can share again.");
        return;
      }
      applyReview(run.id, parsed.value, close || parsed.value.closed);
      if (close) setLinks(false);
      setNotice(close ? "Review links closed." : "Review decisions refreshed.");
    } catch (caught) { showError(caught); }
    finally { setBusy(false); setConfirmClose(false); }
  }
  function invitation(value: Share, token: string) {
    return window.location.origin + "/review#" + value.id + "." + token;
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > maxBackupSize) throw new Error("Choose a workspace backup smaller than 3.5 MB.");
      const imported = readBackup(JSON.parse(await file.text()));
      const existing = dataRef.current;
      const ids = new Set(existing.workflows.map(item => item.id));
      const workflows = [...imported.workflows.filter(item => {
        if (ids.has(item.id)) return false;
        ids.add(item.id);
        return true;
      }), ...existing.workflows];
      if (workflows.length > 50) throw new Error("This backup would exceed the 50-rehearsal workspace limit.");
      updateData(() => ({ workflows, policy: writeEnabled ? existing.policy : imported.policy, shares: existing.shares }), true);
      setWriteEnabled(true);
      setError("");
      setNotice(workflows.length === existing.workflows.length ? "Every rehearsal in this backup is already saved." : "Backup imported.");
    } catch (caught) { showError(caught instanceof SyntaxError ? new Error("Choose a valid Before the Click JSON backup.") : caught); }
  }
  function exportBackup() {
    try {
      downloadJson("before-the-click-workspace.json", encodedBackup(dataRef.current.workflows, dataRef.current.policy));
      setNotice("Backup downloaded.");
    } catch (caught) { showError(caught); }
  }

  return <div className="workspace-app">
    <header className="workspace-top"><div>
      <Brand /><span className="workspace-top-label">Rehearsal workspace</span>
      <div className="workspace-top-actions">
        <Link className="icon-button" href="/guide" aria-label="Field guide"><BookOpen size={18} /></Link>
        <button className="button dark compact" disabled={!loaded} onClick={() => openNew()}><Plus size={17} /> <span>New rehearsal</span></button>
      </div>
    </div></header>
    <div className="workspace-shell">
      <aside className="workspace-nav"><nav aria-label="Workspace navigation">{tabs.map(({ id, label, short, icon: Icon }) =>
        <button key={id} className={view === id || id === "history" && view === "audit" ? "active" : ""}
          aria-current={view === id ? "page" : undefined} onClick={() => route(id)}>
          <Icon size={19} strokeWidth={1.7} /><span className="nav-wide">{label}</span><span className="nav-small">{short}</span>
        </button>)}</nav>
        <div className="rail-foot"><ShieldCheck size={18} /><span><strong>Sandbox</strong><small>Isolated from live services</small></span></div>
      </aside>
      <main id="main-content" className="workspace-content">
        <div className="workspace-heading"><div><h1>{info.title}</h1><p>{info.detail}</p></div>
          {run && (view === "map" || view === "review" || view === "audit") && <label className="field run-select">
            <span className="sr-only">Current rehearsal</span><select value={run.id} onChange={event => route(view, event.target.value)}>
              {data.workflows.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>}
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {storageError && <div className="error-banner" role="alert">{storageError}</div>}
        {!loaded ? <div className="surface empty-state" role="status">Opening your workspace…</div> : <>
          {view === "overview" && <Overview run={run} onNew={openNew} onReview={() => route("review")} onAudit={() => route("audit")} />}
          {view === "review" && run && <Approvals key={run.id + ":" + run.reviewers.find(item => item.status === "pending")?.id}
            run={run} share={share} busy={busy} onUpdate={updateRun} onDecision={localDecision} onMap={() => route("map")}
            onShare={() => { if (share?.published) setLinks(true); else if (share) void publishLinks(); else setConfirmShare(true); }}
            onRefresh={() => void refreshReview()} onCloseShare={() => setConfirmClose(true)} />}
          {view === "map" && run && <Simulator key={run.id} run={run} policy={data.policy} busy={busy}
            onReview={() => route("review")} onRun={runSimulation} onAudit={() => route("audit")} />}
          {view === "history" && <History workflows={data.workflows} onOpen={value => route(value.result ? "audit" : "review", value.id)} onCopy={copyRun} onNew={openNew} />}
          {view === "audit" && run && <Audit run={run} onArchive={runArchive} onMap={() => route("map")} />}
          {["review", "map", "audit"].includes(view) && !run && <div className="surface empty-state"><h2>Start with a rehearsal.</h2>
            <button className="button dark" onClick={() => openNew()}>New rehearsal <ArrowRight size={16} /></button></div>}
          {view === "policy" && <section className="surface policy-surface">
            {policies.map(rule => <label className="policy-row" key={rule.key}>
              <span><strong>{rule.name}</strong><small>{rule.info}</small></span>
              <input type="checkbox" role="switch" className="switch" checked={data.policy[rule.key]}
                onChange={event => updateData(current => ({ ...current, policy: { ...current.policy, [rule.key]: event.target.checked } }))} />
            </label>)}
            <div className="button-row"><button className="button secondary" onClick={() => {
              updateData(current => ({ ...current, policy: defaultPolicy })); setNotice("Default guardrails restored.");
            }}>Restore defaults</button></div>
          </section>}
          {view === "settings" && <section className="surface settings-surface">
            <div className="settings-icon"><Cloud size={22} /></div><h2>Workspace backups</h2>
            <p>Export rehearsals and sandbox rules as JSON. Import adds new rehearsals to this browser.</p>
            <div className="button-row"><button className="button dark" onClick={exportBackup}><ArrowDownToLine size={17} /> Download backup</button>
              <button className="button secondary" onClick={() => fileInput.current?.click()}>Import backup</button>
              <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile} />
            </div>
          </section>}
        </>}
        <footer className="workspace-footer"><Link href="/">Before the Click</Link><Link href="/guide">Field guide <ArrowUpRight size={13} /></Link></footer>
      </main>
    </div>
    <div className={notice ? "toast visible" : "toast"} role="status">{notice && <><Check size={17} />{notice}</>}</div>
    {creating && <NewRun initial={startingScenario} onClose={dismissNew} onCreate={addRun} />}
    {confirmShare && <Dialog title="Share this plan for review?" onClose={() => setConfirmShare(false)}>
      <div className="dialog-body stack">
        <p>Each link opens the review packet for one person and expires after 14 days. Anyone holding the link can act for that reviewer.</p>
        <p className="field-hint">The packet includes the goal and ordinary source details. Sources marked private are redacted.</p>
        <div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmShare(false)}>Cancel</button>
          <button className="button dark" onClick={() => { setConfirmShare(false); void publishLinks(); }}><Link2 size={16} /> Create review links</button></div>
      </div>
    </Dialog>}
    {links && run && share && <Dialog title="Reviewer links" onClose={() => setLinks(false)}>
      <div className="dialog-body stack"><p>Send each person their own link. {share.expiresAt ? "Expires " + prettyDate(share.expiresAt) + "." : ""}</p>
        {share.invites.map(invite => {
          const person = run.reviewers.find(item => item.id === invite.id);
          const url = invitation(share, invite.token);
          return <div className="invite-row" key={invite.id}><label className="field">{person?.name ?? "Reviewer"}
            <input value={url} readOnly onFocus={event => event.target.select()} /></label>
            <button className="icon-button" aria-label={"Copy link for " + (person?.name ?? "reviewer")} onClick={async () => {
              try { await navigator.clipboard.writeText(url); setNotice("Link copied."); }
              catch { setNotice("Select the link to copy it manually."); }
            }}><Clipboard size={17} /></button><a className="icon-button" href={url} target="_blank" rel="noreferrer"
              aria-label={"Open link for " + (person?.name ?? "reviewer")}><ArrowUpRight size={17} /></a></div>;
        })}
        <div className="dialog-actions"><button className="button dark" onClick={() => setLinks(false)}>Done</button></div>
      </div>
    </Dialog>}
    {confirmClose && <Dialog title={share?.published ? "Close review links?" : "Cancel sharing?"} onClose={() => setConfirmClose(false)}>
      <div className="dialog-body stack"><p>Recorded decisions stay in this workspace. Closing prevents further use of the links.</p>
        <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmClose(false)}>Keep links</button>
          <button className="button dark" disabled={busy} onClick={() => void refreshReview(true)}>Close review links</button></div>
      </div>
    </Dialog>}
  </div>;
}

function Overview({ run, onNew, onReview, onAudit }: { run?: Run; onNew: (id: ScenarioId) => void; onReview: () => void; onAudit: () => void }) {
  return <>
    {run && <div className="overview-feature"><div>
      <div className="section-kicker">CURRENT REHEARSAL</div><h2>{run.title}</h2><p>{run.objective}</p>
      <div className="button-row"><button className="button dark" onClick={run.result ? onAudit : onReview}>{run.result ? "View audit record" : "Continue rehearsal"} <ArrowRight size={17} /></button><Status run={run} /></div>
    </div><div className="overview-art" aria-hidden="true" /></div>}
    <section className="overview-scenarios"><h2>Start a new rehearsal</h2><div className="scenario-cards">
      {Object.entries(scenarios).map(([id, scenario]) => {
        const Icon = scenarioIcons[id as keyof typeof scenarioIcons];
        return <button key={id} onClick={() => onNew(id as ScenarioId)}><Icon size={22} /><strong>{scenario.label}</strong>
          <span>{scenario.description}</span><ArrowUpRight size={15} /></button>;
      })}
    </div></section>
    <div className="overview-guide"><Archive size={17} /><p>Your rehearsals and audit records are saved in this browser.</p><Link href="/guide">How this works <ArrowRight size={15} /></Link></div>
  </>;
}
