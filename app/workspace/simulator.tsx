"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { ArrowRight, CircleAlert, Expand, Layers, Minus, Plus, RotateCcw, ShieldCheck, X } from "lucide-react";
import { blockingRule } from "@/lib/engine";
import { actionLabels, phase, riskFor, type Policy, type Run } from "@/lib/model";

const locations = [
  [24, 30], [40, 46], [69, 40], [75, 72], [22, 71], [52, 24], [53, 68], [88, 48],
  [11, 50], [11, 23], [77, 20], [31, 83], [61, 83], [88, 82], [33, 18], [46, 36],
  [72, 55], [34, 62], [59, 47], [63, 30], [79, 32], [17, 59], [43, 78], [86, 63]
];

export default function Simulator({ run, policy, busy, onReview, onRun, onAudit }: {
  run: Run; policy: Policy; busy: boolean; onReview: () => void; onRun: () => void; onAudit: () => void;
}) {
  const [selectedId, setSelected] = useState<string | undefined>(run.actions[0]?.id);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [display, setDisplay] = useState<"before" | "after">(run.result ? "after" : "before");
  const frame = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const dragging = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const selected = run.actions.find(action => action.id === selectedId);
  const selectedIndex = run.actions.findIndex(action => action.id === selectedId);
  const source = run.sources.find(item => item.id === selected?.target);
  const result = run.result?.rows.find(row => row.id === selected?.id);
  const blocked = selected && source && blockingRule(selected, source, policy);
  const ready = phase(run) === "ready";

  function reset() {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }
  function adjust(value: number) {
    setZoom(value);
    setPosition({ x: 0, y: 0 });
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (zoom === 1 || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current || dragging.current.id !== event.pointerId || !frame.current) return;
    const maxX = frame.current.clientWidth * (zoom - 1) / 2;
    const maxY = frame.current.clientHeight * (zoom - 1) / 2;
    setPosition({
      x: Math.min(maxX, Math.max(-maxX, dragging.current.left + event.clientX - dragging.current.x)),
      y: Math.min(maxY, Math.max(-maxY, dragging.current.top + event.clientY - dragging.current.y))
    });
  }
  function select(id: string, fromList = false) {
    setSelected(id);
    if (fromList && zoom !== 1) reset();
  }

  return <div className="simulator">
    <div className="map-surround">
      <div className="map-toolbar">
        <span><Layers size={17} /> Action map</span>
        <div className="map-controls">
          <button className="icon-button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => adjust(Math.min(2, zoom + 0.25))}><Plus size={18} /></button>
          <button className="icon-button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => adjust(Math.max(1, zoom - 0.25))}><Minus size={18} /></button>
          <button className="icon-button" aria-label="Reset map view" onClick={reset}><Expand size={17} /></button>
        </div>
      </div>
      <div ref={frame} className={"map-frame" + (zoom > 1 ? " zoomed" : "")}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onLostPointerCapture={() => { dragging.current = null; }}>
        <div className="map-plane" style={{ transform: "translate(" + position.x + "px," + position.y + "px) scale(" + zoom + ")" }}>
          <Image src="/campus.webp" alt="" fill sizes="(max-width: 900px) 100vw, 900px" unoptimized priority draggable={false} />
          {run.actions.map((action, index) => {
            const place = locations[index];
            const isActive = action.id === selectedId;
            return <button className={"map-pin" + (isActive ? " selected" : "") + (!action.enabled ? " excluded" : "")}
              aria-label={"Action " + (index + 1) + " " + (action.label || actionLabels[action.kind].title)}
              aria-pressed={isActive} key={action.id} style={{ left: place[0] + "%", top: place[1] + "%",
                transform: "translate(-50%,-50%) scale(" + 1 / zoom + ")" }}
              onClick={() => select(action.id)}>{index + 1}</button>;
          })}
        </div>
        {selected && <button className="map-popover" onClick={() => detailHeading.current?.focus()}>
          <span>{selected.label || actionLabels[selected.kind].title}</span>
          <ArrowRight size={15} aria-hidden="true" /><span className="sr-only"> · View action details</span>
        </button>}
        <div className="map-caption">REHEARSAL CAMPUS</div>
      </div>
      <div className="map-bottom"><span>Select a marker to inspect an action.</span>
        {zoom > 1 && <button className="bare" onClick={reset}><RotateCcw size={14} /> Reset zoom</button>}
        <span>{run.actions.length} actions</span>
      </div>
    </div>
    <aside className="map-inspector">
      <div className="aside-panel">
        <div className="section-kicker">ACTION DETAILS</div>
        {selected && source ? <>
          <div className="inspector-title"><span className="detail-pin">{selectedIndex + 1}</span>
            <h3 ref={detailHeading} tabIndex={-1}>{selected.label || actionLabels[selected.kind].title}</h3>
            <button className="icon-button" aria-label="Close action details" onClick={() => setSelected(undefined)}><X size={17} /></button></div>
          <span className={"status-tag " + (riskFor(selected, source) === "High" ? "amber" : "neutral")}>{riskFor(selected, source)} risk</span>
          <div className="source-note"><strong>{source.title}</strong><p>{source.detail || "No details were supplied."}</p>
            {source.sensitive && <span className="status-tag neutral">Private source</span>}</div>
          <p>{selected.detail || actionLabels[selected.kind].reason}</p>
          {result ? <div className="map-result">
            <div className="segmented" role="group" aria-label="Sandbox state">
              <button aria-pressed={display === "before"} onClick={() => setDisplay("before")}>Before</button>
              <button aria-pressed={display === "after"} onClick={() => setDisplay("after")}>After</button>
            </div>
            <strong>{result[display]}</strong><p>{result.message}</p>
            {display === "after" && result.draft && <pre className="draft-content">{result.draft}</pre>}
          </div> : <p className={"policy-note " + (blocked && selected.enabled ? "warning" : "")}>
            {blocked && selected.enabled ? <CircleAlert size={17} /> : <ShieldCheck size={17} />}
            {!selected.enabled ? "Excluded from this rehearsal." : blocked ? blocked + " would block this action." : "No active rule blocks this action."}</p>}
        </> : <p>Choose a marker or an action below.</p>}
        <div className="map-action-list">{run.actions.map((action, index) =>
          <button key={action.id} aria-pressed={action.id === selectedId} onClick={() => select(action.id, true)}>
            <span>{index + 1}</span>{action.label || actionLabels[action.kind].title}<ArrowRight size={13} />
          </button>)}</div>
        {run.result ? <button className="button dark" onClick={onAudit}>View audit record <ArrowRight size={16} /></button>
          : ready ? <button className="button dark" disabled={busy} onClick={onRun}>Run simulation <ArrowRight size={16} /></button>
            : <button className="button dark" onClick={onReview}>Open approval queue <ArrowRight size={16} /></button>}
      </div>
    </aside>
  </div>;
}
