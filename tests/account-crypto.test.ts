import test from "node:test";
import assert from "node:assert/strict";
import {digest,hashPassword,recoveryToken,sessionToken,verifyPassword} from "../lib/account-crypto.ts";
import {usernameField} from "../lib/account-fields.ts";

test("account usernames use a single case-insensitive namespace",()=>{
  assert.equal(usernameField.parse("  Raouf_K "),"raouf_k");
  assert.equal(usernameField.safeParse("raouf@example.com").success,false);
});

test("password hashes are salted and verify only the correct password",async()=>{
  const password="test-password-1234";
  const value=await hashPassword(password);
  assert.notEqual(value,await hashPassword(password));
  assert.equal(await verifyPassword(password,value),true);
  assert.equal(await verifyPassword("incorrect",value),false);
  assert.equal(await verifyPassword(password),false);
  assert.match(recoveryToken(),/^[a-f0-9]{48}$/);
  assert.match(digest(sessionToken()),/^[a-f0-9]{64}$/);
});
