import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

const E2E_ENABLED = process.env.AUTOPSY_E2E === "1";
const E2E_API_RATE_LIMIT_MAX_REQUESTS = "1000";
const E2E_API_RATE_LIMIT_HEAVY_MAX_REQUESTS = "1000";
const E2E_PORT = Number.parseInt(process.env.E2E_PORT ?? "5101", 10);
const TEST_REPOSITORY_URL =
  process.env.AUTOPSY_E2E_REPOSITORY_URL ??
  "https://github.com/octocat/Hello-World.git";

function assertValidPort(port: number): void {
  assert.equal(Number.isSafeInteger(port), true);
  assert.ok(port >= 1 && port <= 65_535);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    once(child, "exit").then(() => undefined),
    delay(10_000)
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }

  await Promise.race([
    once(child, "exit").then(() => undefined),
    delay(2_000)
  ]);
}

async function waitForServer(
  baseUrl: string,
  child: ReturnType<typeof spawn>,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Server exited before becoming ready. stdout=${serverOutput.stdout} stderr=${serverOutput.stderr}`
      );
    }

    try {
      const response = await fetch(baseUrl + "/ready");
      if (response.status === 200) {
        return;
      }
    } catch {
      // Startup is still in progress.
    }

    await delay(500);
  }

  throw new Error(
    `Server did not become ready within ${timeoutMs}ms. stdout=${serverOutput.stdout} stderr=${serverOutput.stderr}`
  );
}

async function waitForAnalysis(
  baseUrl: string,
  analysisRunId: string,
  cookieHeader: string,
  timeoutMs: number
): Promise<{
  status: string;
  targetHeadSha: string | null;
}> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${baseUrl}/api/repositories/${repositoryId}/analysis/${analysisRunId}`,
      {
        headers: {
          Cookie: cookieHeader
        }
      }
    );

    const body = await response.json() as {
      success: boolean;
      analysis?: {
        status: string;
        targetHeadSha: string | null;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.analysis);

    if (body.analysis.status === "completed" || body.analysis.status === "failed") {
      return body.analysis;
    }

    await delay(1_000);
  }

  throw new Error(
    `Analysis did not reach a terminal state within ${timeoutMs}ms. stdout=${workerOutput.stdout} stderr=${workerOutput.stderr}`
  );
}

const serverOutput = {
  stdout: "",
  stderr: ""
};

const workerOutput = {
  stdout: "",
  stderr: ""
};

let repositoryId = "";

test(
  "fresh repository import flows through worker analysis into an evidence report",
  { skip: !E2E_ENABLED, timeout: 240_000 },
  async () => {
    assertValidPort(E2E_PORT);

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(E2E_PORT),
      API_RATE_LIMIT_MAX_REQUESTS: E2E_API_RATE_LIMIT_MAX_REQUESTS,
      API_RATE_LIMIT_HEAVY_MAX_REQUESTS: E2E_API_RATE_LIMIT_HEAVY_MAX_REQUESTS
    };
    delete childEnv.E2E_PORT;

    const server = spawn(process.execPath, ["dist/server.js"], {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });

    server.stdout?.setEncoding("utf8");
    server.stderr?.setEncoding("utf8");
    server.stdout?.on("data", (chunk: string) => {
      serverOutput.stdout += chunk;
    });
    server.stderr?.on("data", (chunk: string) => {
      serverOutput.stderr += chunk;
    });

    const worker = spawn(process.execPath, ["dist/workers/analysis.worker.js"], {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });

    worker.stdout?.setEncoding("utf8");
    worker.stderr?.setEncoding("utf8");
    worker.stdout?.on("data", (chunk: string) => {
      workerOutput.stdout += chunk;
    });
    worker.stderr?.on("data", (chunk: string) => {
      workerOutput.stderr += chunk;
    });

    const baseUrl = `http://127.0.0.1:${E2E_PORT}`;

    try {
      await waitForServer(baseUrl, server, 20_000);

      const testEmail = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;
      const testPassword = "E2E-session-password-2026!";

      const registerResponse = await fetch(
        baseUrl + "/api/auth/register",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            email: testEmail,
            password: testPassword
          })
        }
      );

      const registerBody = await registerResponse.json() as {
        success: boolean;
        user?: {
          email: string;
        };
        requiresEmailVerification?: boolean;
      };

      assert.equal(registerResponse.status, 201);
      assert.equal(registerBody.success, true);
      assert.equal(registerBody.user?.email, testEmail);
      assert.equal(registerBody.requiresEmailVerification, false);

      const setCookie = registerResponse.headers.getSetCookie?.() ?? [];
      const sessionCookie = setCookie.find((value) =>
        value.startsWith("autopsy_session=")
      );
      const csrfCookie = setCookie.find((value) =>
        value.startsWith("autopsy_csrf=")
      );

      assert.ok(sessionCookie);
      assert.ok(csrfCookie);

      const cookieHeader = [sessionCookie, csrfCookie]
        .map((value) => value.split(";")[0])
        .join("; ");
      const csrfToken = decodeURIComponent(
        csrfCookie.split(";")[0].slice("autopsy_csrf=".length)
      );

      const importResponse = await fetch(
        baseUrl + "/api/repositories/import",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Cookie: cookieHeader,
            "x-autopsy-csrf-token": csrfToken
          },
          body: JSON.stringify({
            url: TEST_REPOSITORY_URL
          })
        }
      );

      const importBody = await importResponse.json() as {
        success: boolean;
        repository?: {
          id: string;
        };
        analysis?: {
          id: string;
          status: string;
        };
      };

      assert.equal(importResponse.status, 202);
      assert.equal(importBody.success, true);
      assert.ok(importBody.repository?.id);
      assert.ok(importBody.analysis?.id);
      assert.equal(importBody.analysis?.status, "queued");

      repositoryId = importBody.repository.id;

      const analysis = await waitForAnalysis(
        baseUrl,
        importBody.analysis.id,
        cookieHeader,
        180_000
      );

      if (analysis.status === "failed") {
        throw new Error(
          `Analysis failed. stdout=${workerOutput.stdout} stderr=${workerOutput.stderr}`
        );
      }

      assert.equal(analysis.status, "completed");
      assert.match(analysis.targetHeadSha ?? "", /^[0-9a-f]{40}$/i);

      const reportResponse = await fetch(
        `${baseUrl}/api/repositories/${repositoryId}/report?limit=3`,
        {
          headers: {
            Cookie: cookieHeader
          }
        }
      );

      const reportBody = await reportResponse.json() as {
        success: boolean;
        repositoryId: string;
        report?: {
          fingerprint: string;
          analysis: {
            runId: string;
            status: string;
            targetHeadSha: string | null;
          };
          sections: unknown[];
        };
      };

      assert.equal(reportResponse.status, 200);
      assert.equal(reportBody.success, true);
      assert.equal(reportBody.repositoryId, repositoryId);
      assert.ok(reportBody.report);
      assert.match(reportBody.report.fingerprint, /^[0-9a-f]{64}$/);
      assert.equal(reportBody.report.analysis.runId, importBody.analysis.id);
      assert.equal(reportBody.report.analysis.status, "completed");
      assert.equal(reportBody.report.analysis.targetHeadSha, analysis.targetHeadSha);
      assert.ok(reportBody.report.sections.length > 0);

      const interviewResponse = await fetch(
        `${baseUrl}/api/repositories/${repositoryId}/interview-stories?limit=6`,
        {
          headers: {
            Cookie: cookieHeader
          }
        }
      );

      const interviewBody = await interviewResponse.json() as {
        success: boolean;
        repositoryId: string;
        result?: {
          analysisRunId: string;
          stories: Array<{
            id: string;
            headline: string;
            evidence: unknown[];
            draftAnswer: {
              situation: string;
              approach: string;
              evidenceBackedResult: string;
            };
          }>;
        };
      };

      assert.equal(interviewResponse.status, 200);
      assert.equal(interviewBody.success, true);
      assert.equal(interviewBody.repositoryId, repositoryId);
      assert.ok(interviewBody.result);
      assert.equal(interviewBody.result.analysisRunId, importBody.analysis.id);
      assert.ok(interviewBody.result.stories.length > 0);
      assert.ok(interviewBody.result.stories.length <= 6);
      for (const story of interviewBody.result.stories) {
        assert.ok(story.id);
        assert.ok(story.headline);
        assert.ok(story.evidence.length > 0);
        assert.ok(story.draftAnswer.situation);
        assert.ok(story.draftAnswer.approach);
        assert.ok(story.draftAnswer.evidenceBackedResult);
      }

      // Exercise the backend read models used by all 11 workspace sections.
      // Empty runtime/deployment evidence is valid for a repository that has
      // not connected those external sources; the endpoints must still return
      // successful, well-formed responses. Operations may return 503 only
      // when its own health snapshot is explicitly degraded.
      const workspaceReadEndpoints: Array<{
        label: string;
        path: string;
        allowDegraded?: boolean;
      }> = [
        { label: "overview repository snapshot", path: `/api/repositories/${repositoryId}` },
        { label: "overview analysis history", path: `/api/repositories/${repositoryId}/analysis-runs?page=1&limit=20` },
        { label: "history commits", path: `/api/repositories/${repositoryId}/commits?page=1&limit=50` },
        { label: "history timeline", path: `/api/repositories/${repositoryId}/timeline?page=1&limit=50` },
        { label: "overview hotspots", path: `/api/repositories/${repositoryId}/hotspots?limit=20` },
        { label: "quality repeatedly modified files", path: `/api/repositories/${repositoryId}/repeatedly-modified-files?minTouches=3&limit=20` },
        { label: "quality bug areas", path: `/api/repositories/${repositoryId}/repeated-bug-areas?limit=20` },
        { label: "structure change coupling", path: `/api/repositories/${repositoryId}/coupling?minCoChanges=2&limit=50` },
        { label: "quality refactor signals", path: `/api/repositories/${repositoryId}/refactors?limit=20` },
        { label: "structure dependencies", path: `/api/repositories/${repositoryId}/dependencies?limit=100` },
        { label: "structure architecture", path: `/api/repositories/${repositoryId}/architecture?limit=100` },
        { label: "quality database migrations", path: `/api/repositories/${repositoryId}/database-migrations?limit=100` },
        { label: "quality test evolution", path: `/api/repositories/${repositoryId}/test-evolution?limit=100` },
        { label: "quality test summary", path: `/api/repositories/${repositoryId}/test-evolution/summary` },
        { label: "structure code complexity", path: `/api/repositories/${repositoryId}/complexity?limit=100` },
        { label: "runtime telemetry summary", path: `/api/repositories/${repositoryId}/runtime/telemetry/summary` },
        { label: "runtime telemetry events", path: `/api/repositories/${repositoryId}/runtime/telemetry?page=1&limit=40` },
        { label: "runtime deployment evidence", path: `/api/repositories/${repositoryId}/deployments?limit=50` },
        { label: "runtime historical summary", path: `/api/repositories/${repositoryId}/runtime/historical-correlation/summary?limit=25` },
        { label: "runtime historical correlation", path: `/api/repositories/${repositoryId}/runtime/historical-correlation?limit=25` },
        { label: "runtime historical source context", path: `/api/repositories/${repositoryId}/runtime/historical-correlation/source-context?limit=25` },
        { label: "contributors activity", path: `/api/repositories/${repositoryId}/contributors?limit=25` },
        { label: "operations health", path: "/api/observability/summary", allowDegraded: true }
      ];

      for (let offset = 0; offset < workspaceReadEndpoints.length; offset += 5) {
        const batch = workspaceReadEndpoints.slice(offset, offset + 5);
        await Promise.all(batch.map(async (endpoint) => {
          const response = await fetch(baseUrl + endpoint.path, {
            headers: {
              Cookie: cookieHeader
            }
          });
          const body = await response.json() as {
            success?: boolean;
            status?: string;
            error?: {
              message?: string;
            };
          };

          if (endpoint.allowDegraded) {
            assert.ok(
              response.status === 200 || response.status === 503,
              `${endpoint.label} returned ${response.status}: ${JSON.stringify(body)}`
            );
            assert.ok(
              body.status === "healthy" || body.status === "degraded",
              `${endpoint.label} returned an invalid health payload: ${JSON.stringify(body)}`
            );
          } else {
            assert.equal(
              response.status,
              200,
              `${endpoint.label} returned ${response.status}: ${JSON.stringify(body)}`
            );
            assert.equal(
              body.success,
              true,
              `${endpoint.label} returned an unsuccessful payload: ${JSON.stringify(body)}`
            );
          }
        }));
      }
    } finally {
      await Promise.allSettled([
        stopProcess(server),
        stopProcess(worker)
      ]);
    }
  }
);
