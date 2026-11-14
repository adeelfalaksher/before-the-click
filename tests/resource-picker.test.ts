import test from "node:test";
import assert from "node:assert/strict";
import {extractEmailAddress, resourceName, isDriveFolder} from "../lib/resource-picker.ts";

test("extracts sender address from a Gmail From header safely",()=>{
 assert.equal(extractEmailAddress("Research Team <research@example.com>"),"research@example.com");
 assert.equal(extractEmailAddress("alice@example.com"),"alice@example.com");
 assert.equal(extractEmailAddress("bad\r\nBcc: victim@example.com"),"");
});
test("labels Google resources without fabricated titles",()=>{
 assert.equal(resourceName({subject:"Quarterly review"},"gmail"),"Quarterly review");
 assert.equal(resourceName({title:"Budget"},"drive"),"Budget");
 assert.equal(resourceName({},"calendar"),"Untitled event");
});
test("recognizes real Google Drive folders for destination selection",()=>{
 assert.equal(isDriveFolder({mimeType:"application/vnd.google-apps.folder"}),true);
 assert.equal(isDriveFolder({mimeType:"application/pdf"}),false);
});
