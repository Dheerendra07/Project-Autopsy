import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const html = readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = readFileSync(path.join(root, "public", "app.js"), "utf8");

test("authentication UI contract stays explicit and mode-correct", () => {
  assert.match(
    html,
    /id="settings"[^>]*aria-label="Sign in to your private workspace"[^>]*title="Sign in to your private workspace"/
  );
  assert.match(app, /button.setAttribute\('aria-label',verified\?'Open account settings':'Sign in to your private workspace'\)/);

  assert.match(
    html,
    /id="authPasswordHint"[^>]*hidden[^>]*>Use at least 12 characters.<\/small>/
  );
  assert.match(
    app,
    /S\.authMode===\'register\'\?\'Create your Project Autopsy account\'/
  );
  assert.match(
    app,
    /S\.authMode==='register'\?'Use your email and a password with at least 12 characters\.'/
  );
  assert.match(
    app,
    /\$\('resendVerification'\).hidden=S.authMode!=='login';/
  );
  assert.match(
    app,
    /\$\('authPasswordHint'\).hidden=S.authMode!=='register';/
  );
});
