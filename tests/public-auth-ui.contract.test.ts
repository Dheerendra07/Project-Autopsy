import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
function readNormalizedFile(...segments: string[]): string {
  return readFileSync(path.join(root, ...segments), "utf8").replace(/\r\n/g, "\n");
}

const html = readNormalizedFile("public", "index.html");
const app = readNormalizedFile("public", "app.js");

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
  assert.match(
    app,
    /S\.user=result\.user;\s*S\.csrfToken=result\.csrfToken;\s*S\.authInterrupt=false;\s*S\.connectionState='verified';/
  );
  assert.match(
    app,
    /button\.querySelector\('span'\)\.textContent='Verify & continue'/
  );
  assert.match(
    app,
    /\$\('authModeToggle'\)\.onclick=function\(\)\{\s*\$\('authError'\)\.hidden=true;\s*\$\('authNotice'\)\.hidden=true;/
  );
  assert.equal((app.match(/\$\('formerr'\)\.hidden=true;\s*closeAuth\(\);/g) ?? []).length, 2);
  assert.match(
    app,
    /toast\('Email verified\.'[\s\S]*?restoreSavedWorkspace\(\)/
  );
});

test("successful sign-in opens the saved or most recent repository workspace", () => {
  assert.match(
    app,
    /var recentRepositories=await loadRecentRepositories\(\);[\s\S]*?await restoreDefaultWorkspace\(recentRepositories\)/
  );
  assert.match(
    app,
    /async function restoreDefaultWorkspace\(repositories\)\{\s*if\(await restoreSavedWorkspace\(\)\)return true;\s*var recent=Array\.isArray\(repositories\)\?repositories:\[\];\s*if\(recent\[0\]&&recent\[0\]\.id&&await openSavedRepository\(recent\[0\]\.id\)\)return true;\s*landing\(\);/
  );
  assert.match(
    app,
    /if\(await restoreSavedWorkspace\(\)\)return;\s*if\(recentRepositories\[0\]&&recentRepositories\[0\]\.id&&await openSavedRepository\(recentRepositories\[0\]\.id\)\)return;\s*landing\(\)/
  );
});
