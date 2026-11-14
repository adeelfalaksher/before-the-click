"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, FolderOpen, Inbox, LoaderCircle, Sparkles } from "lucide-react";
import { z } from "zod";
import { createRun, guidedPlan, readSources } from "@/lib/engine";
import { actionLabels, kindSchema, scenarioIds, scenarios, type Run, type ScenarioId } from "@/lib/model";
import Dialog from "./dialog";

export const scenarioIcons = { inbox: Inbox, calendar: CalendarDays, files: FolderOpen };
const planResponse = z.object({ actions: z.array(z.object({ kind: kindSchema, target: z.string() })).min(1).max(12) });

export default function NewRun({ initial = "inbox", onClose, onCreate }: { initial?: ScenarioId; onClose: () => void; onCreate: (run: Run) => void }) {
  const [scenario, setScenario] = useState<ScenarioId>(initial);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState(scenarios[initial].goal);
  const [records, setRecords] = useState("");
  const [custom, setCustom] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"guided" | "gemini">("guided");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = scenarios[scenario];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/plan", { signal: controller.signal }).then(res => res.json())
      .then(({ available }) => setAi(available === true))
      .catch(() => { if (!controller.signal.aborted) setAi(false); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const objective = goal.trim();
      if (!objective) throw new Error("Enter what you want to achieve.");
      const sources = custom ? readSources(records) : selected.sources;
      if (!sources.length) throw new Error("Add at least one source record.");
      let proposals = guidedPlan(scenario, sources, !custom);
      if (mode === "gemini") {
        const response = await fetch("/api/plan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objective, scenario, sources })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Gemini could not build the plan.");
        proposals = planResponse.parse(body).actions;
      }
      onCreate(createRun({ title: title.trim() || selected.title, objective, scenario, sources, proposals, mode }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The rehearsal could not be created.");
    } finally { setBusy(false); }
  }

  return <Dialog title="New rehearsal" onClose={() => { if (!busy) onClose(); }}>
    <form className="dialog-body stack" onSubmit={submit}>
      <fieldset disabled={busy} className="scenario-field"><legend>Choose a scenario</legend>
        <div className="scenario-options">{scenarioIds.map(id => {
          const Icon = scenarioIcons[id];
          return <label className={"scenario-option " + (scenario === id ? "selected" : "")} key={id}>
            <input type="radio" name="scenario" checked={scenario === id} onChange={() => { setScenario(id); setGoal(scenarios[id].goal); }} />
            <Icon size={19} /> <span>{scenarios[id].label}</span>
          </label>;
        })}</div>
        <p className="field-hint">{selected.description}</p>
      </fieldset>
      <label className="field">Rehearsal name <input value={title} maxLength={100} placeholder={selected.title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="field">What should happen?
        <textarea rows={3} required value={goal} maxLength={1200} onChange={e => setGoal(e.target.value)} />
      </label>
      <label className="check-label"><input type="checkbox" checked={custom} onChange={e => setCustom(e.target.checked)} /> Use my own source records</label>
      {custom ? <label className="field">Source records
        <textarea rows={4} required maxLength={9100} value={records} placeholder={"Interview request | Ask for two time slots\nLaunch date | Internal only | private"} onChange={e => setRecords(e.target.value)} />
        <span className="field-hint">One record per line. Enter a title, then optional details and a private flag, separated by |.</span>
      </label> : <details className="sample-disclosure"><summary>View sample records</summary><ul>{selected.sources.map(source => <li key={source.id}>{source.title}{source.sensitive ? " · Private" : ""}</li>)}</ul></details>}
      <label className="field">Planning method
        <select value={mode} onChange={e => setMode(e.target.value === "gemini" ? "gemini" : "guided")}>
          <option value="guided">Guided planner</option>
          <option value="gemini" disabled={!ai}>Gemini{ai === false ? " · awaiting setup" : ""}</option>
        </select>
      </label>
      {mode === "gemini" && <p className="field-hint"><Sparkles size={14} /> Gemini receives your goal and ordinary records. Keep private details out of the goal.</p>}
      {mode === "guided" && !custom && <p className="field-hint">{selected.steps.map(action => actionLabels[action.kind].title).join(" · ")}</p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="button dark" disabled={busy}>{busy ? <>Building plan <LoaderCircle className="spin" size={17} /></> : <>Create rehearsal <ArrowRight size={17} /></>}</button>
      </div>
    </form>
  </Dialog>;
}
