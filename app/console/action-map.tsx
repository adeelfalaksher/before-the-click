"use client";

import Image from "next/image";
import {useState, type ReactNode} from "react";
import {ArrowRight, Expand, Layers, Minus, Plus} from "lucide-react";

const stages = [
  {name:"Proposal", x:24, y:30},
  {name:"Approval", x:40, y:47},
  {name:"Execution", x:69, y:40},
  {name:"Verification", x:75, y:72}
];

export function ActionMap({
  title, status, details, onReview
}: {
  title: string;
  status: string;
  details: readonly ReactNode[];
  onReview: () => void;
}){
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  return <div className="simulator">
    <section className="map-surround" aria-label="Workflow action map">
      <div className="map-toolbar">
        <span><Layers size={17}/> Action map</span>
        <div className="map-controls">
          <button className="icon-button" aria-label="Zoom in" disabled={zoom >= 2} onClick={()=>setZoom(zoom+.25)}><Plus size={18}/></button>
          <button className="icon-button" aria-label="Zoom out" disabled={zoom <= 1} onClick={()=>setZoom(zoom-.25)}><Minus size={18}/></button>
          <button className="icon-button" aria-label="Reset map view" onClick={()=>setZoom(1)}><Expand size={17}/></button>
        </div>
      </div>
      <div className="map-frame">
        <div className="map-plane" style={{transform:`scale(${zoom})`,transformOrigin:`${stages[selected].x}% ${stages[selected].y}%`}}>
          <Image src="/campus.webp" fill sizes="(max-width: 900px) 100vw, 900px" alt="" unoptimized/>
          {stages.map((stage,index)=><button key={stage.name} className={"map-pin"+(selected===index?" selected":"")}
            aria-label={stage.name} aria-pressed={selected===index} onClick={()=>setSelected(index)}
            style={{left:`${stage.x}%`,top:`${stage.y}%`,transform:`translate(-50%,-50%) scale(${1/zoom})`}}>{index+1}</button>)}
        </div>
      </div>
      <div className="map-bottom"><span>Select a marker to inspect a stage.</span><span>{status}</span></div>
    </section>
    <aside className="map-inspector">
      <div className="aside-panel">
        <span className="section-kicker">{title}</span>
        <div aria-live="polite">
          <div className="inspector-title"><span className="detail-pin">{selected+1}</span><h3>{stages[selected].name}</h3></div>
          {details[selected]}
        </div>
        <div className="map-action-list" role="group" aria-label="Inspect workflow stage">
          {stages.map((stage,index)=><button key={stage.name} aria-pressed={selected===index} onClick={()=>setSelected(index)}>
            <span>{index+1}</span>{stage.name}<ArrowRight size={13}/>
          </button>)}
        </div>
        <button className="button dark" onClick={onReview}>Open approval queue <ArrowRight size={16}/></button>
      </div>
    </aside>
  </div>;
}
