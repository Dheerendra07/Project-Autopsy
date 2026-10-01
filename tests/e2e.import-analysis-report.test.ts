import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

const E2E_ENABLED = process.env.AUTOPSY_E2E === "1";
const TEST_API_KEY = "e2e-api-access-key-12345678901234567890";
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
          "x-autopsy-api-key": TEST_API_KEY
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
      AUTOPSY_API_ACCESS_KEY: TEST_API_KEY,
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

      const importResponse = await fetch(
        baseUrl + "/api/repositories/import",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-autopsy-api-key": TEST_API_KEY
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
            "x-autopsy-api-key": TEST_API_KEY
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
    } finally {
      await Promise.allSettled([
        stopProcess(server),
        stopProcess(worker)
      ]);
    }
  }
);
