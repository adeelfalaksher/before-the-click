import {
  actionLabels, phase, scenarios,
  type Action, type ActionProposal, type Choice, type Policy, type Reviewer,
  type Run, type SandboxRecord, type ScenarioId, type Source
} from "./model.ts";

const timestamp = () => new Date().toISOString();
export const makeId = () => crypto.randomUUID();

export function record(run: Run, detail: string, actor = "You", at = timestamp()): Run {
  return { ...run, updatedAt: at, activity: [...run.activity, { at, actor, detail }].slice(-150) };
}

export function newReviewer(name: string, role = "", instructions = ""): Reviewer {
  if (!name.trim()) throw new Error("Enter the reviewer’s name.");
  return { id: makeId(), name: name.trim(), role: role.trim(), instructions: instructions.trim(), status: "pending", note: "", decidedAt: null };
}

export function validProposal(scenario: ScenarioId, sources: Source[], proposal: ActionProposal) {
  return scenarios[scenario].allowed.includes(proposal.kind) &&
    sources.some(source => source.id === proposal.target);
}

export function guidedPlan(scenario: ScenarioId, sources: Source[], useSample: boolean): ActionProposal[] {
  const catalog = scenarios[scenario];
  if (useSample) return catalog.steps;
  return sources.map(source => {
    let kind: ActionProposal["kind"] = "preserve";
    if (!source.sensitive) {
      if (scenario === "files") kind = "move";
      if (scenario === "calendar" && /internal|stand.up|roadmap/i.test(source.title + " " + source.detail)) kind = "reschedule";
      if (scenario === "inbox") kind = /newsletter|roundup|automated/i.test(source.title + " " + source.detail) ? "archive" : "draft";
    }
    return { kind, target: source.id };
  });
}

export function createRun(input: {
  title: string; objective: string; scenario: ScenarioId; sources: Source[];
  proposals: ActionProposal[]; mode?: Run["mode"]; reviewers?: Reviewer[];
}): Run {
  const at = timestamp();
  const seen = new Set<string>();
  const actions: Action[] = [];
  for (const proposal of input.proposals) {
    const key = proposal.kind + ":" + proposal.target;
    if (!validProposal(input.scenario, input.sources, proposal) || seen.has(key)) {
      throw new Error("The plan includes a duplicate or unsupported action.");
    }
    seen.add(key);
    actions.push({ ...proposal, id: makeId(), enabled: true });
  }
  if (!actions.length || actions.length > 24) throw new Error("A plan needs between 1 and 24 actions.");
  return record({
    id: makeId(), title: input.title.trim(), objective: input.objective.trim(), scenario: input.scenario,
    sources: input.sources, actions, mode: input.mode ?? "guided", createdAt: at, updatedAt: at,
    archivedAt: null, result: null, reviewers: input.reviewers ?? [newReviewer("You", "Workspace owner")], activity: []
  }, "Rehearsal created.", "You", at);
}

export function starterRun() {
  const scenario = scenarios.inbox;
  return createRun({
    title: "Launch-week inbox", objective: scenario.goal, scenario: "inbox", sources: scenario.sources,
    proposals: scenario.steps, reviewers: [
      newReviewer("You", "Workspace owner", "Check the source for each proposed action."),
      newReviewer("Operations", "Second review", "Confirm private launch details are protected.")
    ]
  });
}

export function nextReviewer(reviewers: Reviewer[]) {
  const next = reviewers.find(reviewer => reviewer.status !== "approved");
  return next?.status === "pending" ? next : undefined;
}

export function reviewDecision(reviewers: Reviewer[], id: string, choice: Choice, note: string, at = timestamp()): Reviewer[] {
  if (nextReviewer(reviewers)?.id !== id) throw new Error("This reviewer is out of turn or has already decided.");
  const message = note.trim();
  if (choice !== "approved" && !message) throw new Error("Add a note to explain this decision.");
  return reviewers.map(reviewer => reviewer.id === id
    ? { ...reviewer, status: choice, note: message, decidedAt: at } : reviewer);
}

export function decide(run: Run, id: string, choice: Choice, note: string): Run {
  if (phase(run) !== "review") throw new Error("This rehearsal is not awaiting a review.");
  const reviewer = run.reviewers.find(item => item.id === id);
  const at = timestamp();
  const labels = { approved: "Approved the plan.", changes: "Requested changes.", rejected: "Rejected the plan." };
  return record({ ...run, reviewers: reviewDecision(run.reviewers, id, choice, note, at) },
    labels[choice], reviewer?.name ?? "Reviewer", at);
}

export function restartReview(run: Run, objective: string, actions: Action[], reviewers = run.reviewers) {
  if (run.result || run.archivedAt) throw new Error("Duplicate this rehearsal to edit a completed record.");
  if (!objective.trim() || !actions.some(action => action.enabled)) {
    throw new Error("Enter a goal and include at least one action.");
  }
  return record({
    ...run, objective: objective.trim(), actions,
    reviewers: reviewers.map(reviewer => ({ ...reviewer, status: "pending", note: "", decidedAt: null }))
  }, "Plan updated and sent back to the first reviewer.");
}

export function duplicateRun(run: Run) {
  const copy = createRun({
    title: (run.title + " (copy)").slice(0, 100), objective: run.objective, scenario: run.scenario,
    sources: run.sources, proposals: run.actions, mode: run.mode,
    reviewers: run.reviewers.map(item => newReviewer(item.name, item.role, item.instructions))
  });
  copy.actions = copy.actions.map((action, index) => ({
    ...run.actions[index], id: action.id
  }));
  return copy;
}

export function blockingRule(action: ActionProposal, source: Source, policy: Policy) {
  if (policy.privacy && source.sensitive && ["send", "share", "move", "delete"].includes(action.kind)) {
    return "Private source protection";
  }
  if (policy.external && (action.kind === "send" || action.kind === "share")) return "External action protection";
  if (policy.destructive && action.kind === "delete") return "File deletion protection";
}

function initialRecord(source: Source, scenario: ScenarioId): SandboxRecord {
  const location = scenario === "calendar" ? (source.detail.split(" · ")[0].slice(0, 220) || "Original time") :
    scenario === "files" ? (source.detail.split("/")[0].split(" · ")[0].trim().slice(0, 220) || "Original folder") : "Inbox";
  return {
    id: source.id, title: source.title, location,
    archived: false, deleted: false, shared: false, notices: 0, drafts: []
  };
}

function summary(record: SandboxRecord) {
  if (record.deleted) return "Removed from sandbox";
  const notes = [
    record.archived ? "Archived" : record.location,
    record.shared ? "Marked shared" : "",
    record.drafts.length ? record.drafts.length + " draft" + (record.drafts.length === 1 ? "" : "s") : "",
    record.notices ? record.notices + " simulated send" + (record.notices === 1 ? "" : "s") : ""
  ];
  return notes.filter(Boolean).join(" · ");
}

function makeDraft(source: Source, scenario: ScenarioId) {
  if (source.sensitive) return "Private follow-up draft. Review the original record locally before adding details.";
  const context = source.detail || "Please review the original item and confirm the next step.";
  if (scenario === "calendar") return "Subject: Scheduling update for " + source.title +
    "\n\nHi, I’m following up to confirm a time for " + source.title + ". Please let me know which time works for you.\n\nScheduling context: " + context;
  return "Subject: Re: " + source.title +
    "\n\nHi, thanks for reaching out about " + source.title + ". I’ll review the details and follow up with the next step.\n\nNotes for the reviewer: " + context;
}

function laterSlot(location: string, records: SandboxRecord[]) {
  const time = location.match(/^(.*?)([01]?\d|2[0-3]):([0-5]\d)–([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!time) return location.slice(0, 180) + " · next rehearsal slot";
  const toMinutes = (hour: string, minute: string) => Number(hour) * 60 + Number(minute);
  const start = toMinutes(time[2], time[3]);
  const end = toMinutes(time[4], time[5]);
  const duration = end - start || 30;
  if (duration < 0) return location.slice(0, 180) + " · next rehearsal slot";
  const booked = records.map(record => record.location.match(/^(.*?)([01]?\d|2[0-3]):([0-5]\d)–([01]?\d|2[0-3]):([0-5]\d)$/))
    .filter(slot => slot?.[1] === time[1])
    .map(slot => [toMinutes(slot![2], slot![3]), toMinutes(slot![4], slot![5])]);
  const clock = (minute: number) => String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
  for (let candidate = end; candidate + duration < 1440; candidate += 15) {
    if (booked.every(([from, to]) => candidate + duration <= from || candidate >= to)) {
      return time[1] + clock(candidate) + "–" + clock(candidate + duration);
    }
  }
  return location.slice(0, 180) + " · next rehearsal day";
}

export function simulate(run: Run, policy: Policy): Run {
  if (run.result) return run;
  if (phase(run) !== "ready") throw new Error("Finish the approval queue before running the simulation.");
  const at = timestamp();
  const before = run.sources.map(source => initialRecord(source, run.scenario));
  const after = structuredClone(before);
  const rows: NonNullable<Run["result"]>["rows"] = run.actions.map(action => {
    const source = run.sources.find(item => item.id === action.target);
    const target = after.find(item => item.id === action.target);
    if (!source || !target || !validProposal(run.scenario, run.sources, action)) {
      throw new Error("The plan contains an operation outside this sandbox.");
    }
    const previous = summary(target);
    const unchanged = { id: action.id, before: previous, after: previous };
    if (!action.enabled) return { ...unchanged, status: "skipped", message: "Excluded during review." };
    const block = blockingRule(action, source, policy);
    if (block) return { ...unchanged, status: "blocked", message: block + " blocked the action." };
    if (target.deleted && action.kind !== "preserve") {
      return { ...unchanged, status: "blocked", message: "An earlier action removed this record." };
    }
    let draft: string | undefined;
    switch (action.kind) {
      case "draft":
        draft = makeDraft(source, run.scenario);
        target.drafts.push(draft);
        break;
      case "archive": target.archived = true; break;
      case "send": target.notices++; break;
      case "reschedule": target.location = laterSlot(target.location, after); break;
      case "move": target.location = "Launch"; break;
      case "share": target.shared = true; break;
      case "delete": target.deleted = true; break;
      case "preserve": break;
    }
    const updated = summary(target);
    return { id: action.id, status: "applied", before: previous, after: updated, draft,
      message: previous === updated ? "Kept unchanged." : "Applied to rehearsal data." };
  });
  return record({ ...run, result: { at, policy, rows, state: { before, after } } },
    "Simulation finished. " + rows.filter(row => row.status === "blocked").length + " actions blocked.", "Simulator", at);
}

export function archiveRun(run: Run): Run {
  if (run.archivedAt) return run;
  if (!run.result) throw new Error("Complete the simulation before archiving it.");
  const at = timestamp();
  return record({ ...run, archivedAt: at }, "Rehearsal archived.", "You", at);
}

export function readSources(text: string): Source[] {
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim());
  if (!text.trim()) return [];
  if (lines.length > 12) throw new Error("Enter up to 12 source records.");
  return lines.map((line, index) => {
    const parts = line.split("|").map(part => part.trim());
    const [title, detail = "", flag = ""] = parts;
    if (!title || title.length > 140 || detail.length > 600 || parts.length > 3 ||
      (flag && flag.toLowerCase() !== "private")) {
      throw new Error("Check source line " + (index + 1) + ". Use Title | Details | private, with private optional.");
    }
    return { id: "u" + (index + 1), title, detail, sensitive: flag.toLowerCase() === "private" };
  });
}

export function describeAction(run: Run, action: Action) {
  const source = run.sources.find(item => item.id === action.target);
  return action.label || actionLabels[action.kind].title + (source ? " · " + source.title : "");
}
