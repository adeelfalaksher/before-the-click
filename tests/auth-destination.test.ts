import assert from "node:assert/strict";
import test from "node:test";
import { authDestination } from "../lib/auth-destination.ts";

test("preserves account, invitation and recovery routes", () => {
  assert.equal(authDestination("/console?view=integrations"), "/console?view=integrations");
  assert.equal(authDestination("/join?token=example"), "/join?token=example");
  assert.equal(authDestination("/auth/reset"), "/auth/reset");
});
