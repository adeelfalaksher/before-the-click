"use client";

import { useState } from "react";
import { Archive, ArrowRight, Copy, Download, Search } from "lucide-react";
import { describeAction } from "@/lib/engine";
import { phase, phaseLabels, scenarios, type Run } from "@/lib/model";
import { downloadJson } from "./storage";
import { Status } from "./approvals";

const filters = ["all", "review", "changes", "rejected", "ready", "completed", "archived"] as const;
export const prettyDate = (date: string) => new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function History({ workflows, onOpen, onCopy, onNew }: {
  workflows: Run[]; onOpen: (run: Run) => void; onCopy: (run: Run) => void; onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<typeof filters[number]>("all");
  const list = workflows.filter(run => {
    const terms = [run.title, run.objective, scenarios[run.scenario].label].join(" ").toLowerCase();
    return (filter === "all" || phase(run) === filter) && terms.includes(query.trim().toLowerCase());
  });
  return <section className="surface history-surface">
    <div className="history-toolbar">
      <label className="search-input"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search rehearsals" aria-label="Search rehearsals" /></label>
      <label className="field history-filter"><span className="sr-only">Filter by status</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        {filters.map(value => <option key={value} value={value}>{value === "all" ? "All statuses" : phaseLabels[value]}</option>)}
      </select></label>
    </div>
    {list.length ? <div className="history-list">{list.map(run => <div key={run.id} className="history-row">
      <button className="history-name" onClick={() => onOpen(run)}><strong>{run.title}</strong><small>{scenarios[run.scenario].label} · {prettyDate(run.updatedAt)}</small></button>
      <Status run={run} />
      <div className="history-buttons">
        <button className="icon-button" aria-label={"Duplicate " + run.title} onClick={() => onCopy(run)}><Copy size={17} /></button>
        <button className="icon-button" aria-label={"Download " + run.title} onClick={() => downloadJson("rehearsal-" + run.id + ".json", run)}><Download size={17} /></button>
        <button className="icon-button" aria-label={"Open " + run.title} onClick={() => onOpen(run)}><ArrowRight size={17} /></button>
      </div>
    </div>)}</div> : <div className="empty-state"><h3>{workflows.length ? "No rehearsals match" : "No saved rehearsals"}</h3>
      <p>{workflows.length ? "Try another search or status." : "Create a rehearsal to start building a record."}</p>
      {workflows.length ? <button className="button secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
        : <button className="button dark" onClick={onNew}>New rehearsal <ArrowRight size={15} /></button>}
    </div>}
  </section>;
}

export function Audit({ run, onArchive, onMap }: { run: Run; onArchive: () => void; onMap: () => void }) {
  const result = run.result;
  function download() {
    downloadJson("audit-" + run.id + ".json", run);
  }
  return <div className="audit-grid">
    <section className="surface audit-main">
      <h2>{run.title}</h2><p>{run.objective}</p>
      <div className="button-row">
        <button className="button secondary compact" onClick={download}><Download size={16} /> Download audit</button>
        {result && !run.archivedAt && <button className="button dark compact" onClick={onArchive}><Archive size={16} /> Archive rehearsal</button>}
        {run.legacyAudit && <button className="bare" onClick={() => downloadJson("original-" + run.id + ".json", JSON.parse(run.legacyAudit!))}>Download original record</button>}
      </div>
      {result ? <><div className="audit-counters">
        {(["applied", "blocked", "skipped"] as const).map(status => <div key={status}><strong>{result.rows.filter(row => row.status === status).length}</strong><span>{status}</span></div>)}
      </div>
      <div className="audit-table">{result.rows.map(row => {
        const action = run.actions.find(item => item.id === row.id)!;
        return <div key={row.id}><div><strong>{describeAction(run, action)}</strong><p>{row.message}</p></div>
          <div><span>Before</span>{row.before}</div><div><span>After</span>{row.after}</div>
          <span className={"status-tag " + (row.status === "applied" ? "green" : row.status === "blocked" ? "red" : "neutral")}>{row.status}</span>
        </div>;
      })}</div><button className="bare" onClick={onMap}>Inspect outcomes on the map <ArrowRight size={15} /></button></>
      : <p className="audit-empty">Results will appear here after the simulation runs.</p>}
    </section>
    <aside className="aside-panel audit-activity"><div className="section-kicker">ACTIVITY</div><h3>Decision history</h3>
      <ol>{run.activity.slice().reverse().map((entry, index) => <li key={entry.at + index}><strong>{entry.actor}</strong><p>{entry.detail}</p><time dateTime={entry.at}>{prettyDate(entry.at)}</time></li>)}</ol>
    </aside>
  </div>;
}
