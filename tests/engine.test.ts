import assert from "node:assert/strict";
import test from "node:test";
import { archiveRun, createRun, decide, duplicateRun, guidedPlan, newReviewer, readSources, restartReview, simulate, starterRun } from "../lib/engine.ts";
import { backupSchema, defaultPolicy, phase, runSchema, scenarios } from "../lib/model.ts";
import { upgradePolicy, upgradeRuns } from "../lib/legacy.ts";

function fullyApproved(run = starterRun()) {
  return run.reviewers.reduce((current, reviewer) => decide(current, reviewer.id, "approved", ""), run);
}

test("reviewers act in order and each decision is recorded once", () => {
  const run = starterRun();
  const [first, second] = run.reviewers;
  assert.throws(() => decide(run, second.id, "approved", ""), /out of turn/);
  const reviewed = decide(run, first.id, "approved", "Source verified");
  assert.throws(() => decide(reviewed, first.id, "approved", ""), /already decided/);
  assert.equal(reviewed.reviewers[0].note, "Source verified");
  assert.equal(phase(decide(reviewed, second.id, "approved", "")), "ready");
  assert.equal(run.reviewers[0].status, "pending");
});

test("requesting changes and rejection stop the queue until a revision", () => {
  const run = starterRun();
  assert.throws(() => decide(run, run.reviewers[0].id, "changes", ""), /note/);
  for (const status of ["changes", "rejected"] as const) {
    const stopped = decide(run, run.reviewers[0].id, status, "Check the details");
    assert.equal(phase(stopped), status);
    assert.throws(() => simulate(stopped, defaultPolicy), /approval/);
    const revised = restartReview(stopped, "New goal", stopped.actions.map((action, index) => ({ ...action, enabled: index !== 0 })));
    assert.ok(revised.reviewers.every(person => person.status === "pending"));
    const final = simulate(fullyApproved(revised), defaultPolicy);
    assert.equal(final.result?.rows[0].status, "skipped");
  }
});

test("approval does not bypass a guardrail and results carry real sandbox snapshots", () => {
  const run = starterRun();
  assert.throws(() => simulate(run, defaultPolicy), /approval/);
  const ready = fullyApproved(run);
  const completed = simulate(ready, defaultPolicy);
  assert.equal(phase(completed), "completed");
  assert.equal(completed.result?.rows[2].status, "blocked");
  assert.equal(completed.result?.state?.after.find(item => item.id === "m3")?.notices, 0);
  assert.equal(completed.result?.state?.after.find(item => item.id === "m2")?.archived, true);
  assert.equal(completed.result?.state?.before.find(item => item.id === "m2")?.archived, false);
  assert.match(completed.result?.rows[0].draft ?? "", /Customer interview/);
  assert.equal(simulate(completed, defaultPolicy), completed);
  assert.equal(phase(archiveRun(completed)), "archived");
  assert.equal(ready.result, null);
});

test("sandbox policy and prior actions affect later actions on a shared target", () => {
  const scenario = scenarios.files;
  const plan = createRun({ title: "File review", objective: scenario.goal, scenario: "files",
    sources: scenario.sources, proposals: [{ kind: "delete", target: "f3" }, { kind: "move", target: "f3" }] });
  const result = simulate(fullyApproved(plan), { ...defaultPolicy, destructive: false }).result!;
  assert.equal(result.rows[0].status, "applied");
  assert.equal(result.rows[1].status, "blocked");
  assert.equal(result.rows[1].before, "Removed from sandbox");
});

test("the calendar finds a later slot that does not collide with a booking", () => {
  const calendar = scenarios.calendar;
  const plan = createRun({ title: calendar.title, objective: calendar.goal, scenario: "calendar",
    sources: [...calendar.sources, { id: "c4", title: "Booking", detail: "Tuesday 10:30–11:00 · team", sensitive: false }],
    proposals: calendar.steps });
  assert.equal(simulate(fullyApproved(plan), defaultPolicy).result?.rows[0].after, "Tuesday 11:00–11:30");
});

test("custom source records affect the guided operation and can be marked private", () => {
  const sources = readSources("Newsletter | Weekly recap\nInterested customer | Ask for a time\nInternal date | Planned release | private");
  assert.deepEqual(guidedPlan("inbox", sources, false).map(action => action.kind), ["archive", "draft", "preserve"]);
  assert.throws(() => readSources("Something | note | unrecognized"), /line 1/);
  assert.throws(() => readSources(Array(13).fill("Record").join("\n")), /up to 12/);
});

test("duplicate rehearsals are independently reviewable and backups validate", () => {
  const original = archiveRun(simulate(fullyApproved(), defaultPolicy));
  const copy = duplicateRun(original);
  assert.notEqual(copy.id, original.id);
  assert.equal(phase(copy), "review");
  assert.equal(copy.result, null);
  assert.ok(backupSchema.safeParse({
    format: "before-the-click.workspace", version: 2, workflows: [original, copy], policy: defaultPolicy
  }).success);
  assert.ok(!runSchema.safeParse({ ...copy, reviewers: [newReviewer("First"), original.reviewers[1]] }).success);
});

test("legacy saved rehearsals retain the original record and reviewer order", () => {
  const date = "2026-11-13T10:00:00.000Z";
  const legacy = {
    id: "wf-example-launch", title: "Legacy saved rehearsal", objective: "A test goal", scenario: "inbox",
    createdAt: date, updatedAt: date, executedAt: null, archivedAt: null,
    before: { messages: [{ id: "m3", subject: "Original launch note", body: "Original content", tag: "Confidential" }], events: [], files: [] },
    reviewers: [{ id: "r1", name: "Sammy", status: "approved", comment: "OK", reviewedAt: date }, { id: "r2", name: "Larissa", status: "pending" }],
    actions: [{ id: "a4", kind: "send", title: "Original action", detail: "Original detail", target: "m3", status: "queued" }],
    activity: [{ at: date, actor: "You", message: "Saved" }]
  };
  const policy = upgradePolicy({ blockExternalSend: true, blockDelete: false, protectSensitive: true });
  const [run] = upgradeRuns([legacy], policy);
  assert.deepEqual(policy, { external: true, destructive: false, privacy: true });
  assert.equal(run.actions[0].label, "Original action");
  assert.equal(run.sources[0].sensitive, true);
  assert.equal(run.reviewers[0].status, "approved");
  assert.deepEqual(JSON.parse(run.legacyAudit!), legacy);
});
