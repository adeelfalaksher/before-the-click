"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, FolderClosed, LockKeyhole, Mail } from "lucide-react";

const actions = [
  {
    label: "Workspace record", icon: FileText, heading: "Publish a project update",
    target: "Project workspace", details: "Save the approved update in Saved records, with a receipt in the audit log."
  },
  {
    label: "Email", icon: Mail, heading: "Send a project update",
    target: "project-team@example.com", details: "Review the sending account, recipient, subject and message before Gmail sends it."
  },
  {
    label: "Calendar", icon: CalendarDays, heading: "Schedule a project review",
    target: "Primary calendar", details: "Review the event title, date and time before creating the event."
  },
  {
    label: "Drive", icon: FolderClosed, heading: "Move an approved document",
    target: "Shared project folder", details: "Review the source file and destination folder before Drive moves the file."
  }
];

export function ActionPreview() {
  const [selection, setSelection] = useState(0);
  const action = actions[selection];
  const Icon = action.icon;

  return <section className="bt-hero-diagram" aria-label="Explore how actions are reviewed">
    <div className="bt-diagram-top"><span><i /> Action preview</span><span>Approval required</span></div>
    <div className="bt-diagram-main">
      <div className="bt-preview-choices" role="group" aria-label="Action to inspect">
        {actions.map((choice, index) => <button key={choice.label} type="button" aria-pressed={selection === index} onClick={() => setSelection(index)}>{choice.label}</button>)}
      </div>
      <div aria-live="polite">
        <div className="bt-diagram-action"><span><Icon size={19} /></span><div><strong>{action.heading}</strong><small>{action.target}</small></div></div>
        <div className="bt-diagram-message"><span>What a reviewer sees</span><p>{action.details}</p></div>
      </div>
      <div className="bt-diagram-bottom"><span><LockKeyhole size={15} /> Awaiting review</span><Link href="/guide" className="bt-small-link">How approvals work <ArrowRight size={14} /></Link></div>
    </div>
  </section>;
}
