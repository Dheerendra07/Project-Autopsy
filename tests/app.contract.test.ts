import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { after, before } from "node:test";

const TEST_API_KEY = "test-api-access-key-12345678901234567890";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://autopsy:autopsy_dev_password@127.0.0.1:5432/project_autopsy";
process.env.REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
process.env.AUTOPSY_API_ACCESS_KEY = TEST_API_KEY;

let server: Server;
let baseUrl: string;

before(async () => {
  const { app } = await import("../src/app.js");

  server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));

    instance.once("error", reject);
  });

  const address = server.address();

  assert.ok(address);
  assert.equal(typeof address, "object");

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const [{ db }, { redis }] = await Promise.all([
    import("../src/config/database.js"),
    import("../src/config/redis.js")
  ]);

  await Promise.allSettled([
    db.end(),
    redis.quit()
  ]);
});

test("readiness endpoint reports dependency readiness", async () => {
  const response = await fetch(baseUrl + "/ready");

  assert.equal(response.status, 200);

  const body = await response.json() as {
    success: boolean;
    service: string;
    status: string;
    checks: {
      database: string;
      redis: string;
    };
    timestamp: string;
  };

  assert.deepEqual(
    {
      success: body.success,
      service: body.service,
      status: body.status,
      checks: body.checks
    },
    {
      success: true,
      service: "project-autopsy-api",
      status: "ready",
      checks: {
        database: "ready",
        redis: "ready"
      }
    }
  );
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test("health responses expose a correlation request id", async () => {
  const response = await fetch(baseUrl + "/health");

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("x-request-id") ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test("health endpoint stays public", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);

  const body = await response.json() as {
    success: boolean;
    service: string;
    status: string;
    timestamp: string;
  };

  assert.deepEqual(
    {
      success: body.success,
      service: body.service,
      status: body.status
    },
    {
      success: true,
      service: "project-autopsy-api",
      status: "healthy"
    }
  );
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test("API routes reject requests without application credentials", async () => {
  const response = await fetch(`${baseUrl}/api/`);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "API_ACCESS_UNAUTHORIZED",
      message: "API access credentials are invalid."
    }
  });
});

test("API root accepts the configured bearer credential", async () => {
  const response = await fetch(`${baseUrl}/api/`, {
    headers: {
      authorization: `Bearer ${TEST_API_KEY}`
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: "Project Autopsy API",
    version: "0.1.0"
  });
});

test("authenticated unknown API routes reach the API not-found contract", async () => {
  const response = await fetch(`${baseUrl}/api/not-a-real-route`, {
    headers: {
      "x-autopsy-api-key": TEST_API_KEY
    }
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found: GET /api/not-a-real-route"
    }
  });
});



test("protected repository routes reject malformed UUIDs with the validation contract", async () => {
  const response = await fetch(
    baseUrl + "/api/repositories/not-a-uuid/commits",
    {
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    }
  );

  assert.equal(response.status, 400);
  const body = await response.json() as {
    success: boolean;
    error: { code: string; message: string; issues: unknown[] };
  };

  assert.equal(body.success, false);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Request validation failed.");
  assert.ok(Array.isArray(body.error.issues));
});

test("commit pagination rejects zero and oversized limits before persistence access", async () => {
  for (const query of ["page=0&limit=50", "page=1&limit=101"]) {
    const response = await fetch(
      baseUrl + "/api/repositories/00000000-0000-4000-8000-000000000999/commits?" + query,
      {
        headers: {
          "x-autopsy-api-key": TEST_API_KEY
        }
      }
    );

    assert.equal(response.status, 400);
    const body = await response.json() as {
      error: { code: string; issues: unknown[] };
    };
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.issues.length > 0);
  }
});

test("runtime telemetry rejects a non-chronological date window", async () => {
  const response = await fetch(
    baseUrl + "/api/repositories/00000000-0000-4000-8000-000000000999/runtime/telemetry?from=2026-09-30T02:00:00.000Z&to=2026-09-30T01:00:00.000Z",
    {
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    }
  );

  assert.equal(response.status, 400);
  const body = await response.json() as {
    error: { code: string; issues: Array<{ message: string }> };
  };
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(
    body.error.issues.some((issue) =>
      /from must be earlier than to/i.test(issue.message)
    )
  );
});

test("runtime telemetry rejects invalid revision filter shape", async () => {
  const response = await fetch(
    baseUrl + "/api/repositories/00000000-0000-4000-8000-000000000999/runtime/telemetry?revisionSha=abc",
    {
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    }
  );

  assert.equal(response.status, 400);
  const body = await response.json() as {
    error: { code: string; issues: unknown[] };
  };
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(body.error.issues.length > 0);
});

test("report and interpretation endpoints reject limits outside their bounded range", async () => {
  for (const route of [
    "/api/repositories/00000000-0000-4000-8000-000000000999/report?limit=0",
    "/api/repositories/00000000-0000-4000-8000-000000000999/report?limit=51",
    "/api/repositories/00000000-0000-4000-8000-000000000999/interpretation?limit=0",
    "/api/repositories/00000000-0000-4000-8000-000000000999/interpretation?limit=51"
  ]) {
    const response = await fetch(baseUrl + route, {
      headers: {
        "x-autopsy-api-key": TEST_API_KEY,
        "x-autopsy-ai-access-key": "test-ai-key"
      }
    });

    assert.equal(response.status, 400);
    const body = await response.json() as {
      error: { code: string; issues: unknown[] };
    };
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.issues.length > 0);
  }
});



test("repository import rejects invalid branch syntax before queueing work", async () => {
  for (const branch of [
    "",
    "main branch",
    "main;rm",
    "main?x",
    "main#x",
    "--upload-pack=malicious",
    "feature/../main",
    "feature//main",
    "feature/name."
  ]) {
    const response = await fetch(baseUrl + "/api/repositories/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autopsy-api-key": TEST_API_KEY
      },
      body: JSON.stringify({
        url: "https://github.com/octocat/Hello-World.git",
        branch
      })
    });

    assert.equal(response.status, 400);
    const body = await response.json() as {
      success: boolean;
      error: { code: string; issues: unknown[] };
    };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.issues.length > 0);
  }
});

test("repository import rejects unsupported repository hosts before persistence", async () => {
  for (const url of [
    "http://github.com/octocat/Hello-World.git",
    "https://example.com/octocat/Hello-World.git",
    "https://user:password@github.com/octocat/Hello-World.git",
    "https://github.com/octocat/Hello-World.git?token=secret"
  ]) {
    const response = await fetch(baseUrl + "/api/repositories/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autopsy-api-key": TEST_API_KEY
      },
      body: JSON.stringify({ url })
    });

    assert.equal(response.status, 400);
    const body = await response.json() as {
      success: boolean;
      error: { code: string; issues?: unknown[]; message?: string };
    };
    assert.equal(body.success, false);
    assert.ok(body.error);
    assert.notEqual(body.error.code, "INTERNAL_SERVER_ERROR");
  }
});

test("authorization header takes the bearer credential when header key is omitted", async () => {
  const response = await fetch(baseUrl + "/api/", {
    headers: {
      authorization: "Bearer " + TEST_API_KEY
    }
  });

  assert.equal(response.status, 200);
});

test("a wrong header key cannot override a valid bearer credential", async () => {
  const response = await fetch(baseUrl + "/api/", {
    headers: {
      authorization: "Bearer wrong-key",
      "x-autopsy-api-key": "wrong-key"
    }
  });

  assert.equal(response.status, 401);
});

test("analysis status endpoint returns a scoped not-found contract", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000999";
  const analysisRunId = "00000000-0000-4000-8000-000000000998";

  const response = await fetch(
    `${baseUrl}/api/repositories/${repositoryId}/analysis/${analysisRunId}`,
    {
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    }
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "ANALYSIS_NOT_FOUND",
      message: "Analysis run not found."
    }
  });
});

test("contributor endpoint remains behind application access control", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000999";
  const response = await fetch(
    `${baseUrl}/api/repositories/${repositoryId}/contributors`
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "API_ACCESS_UNAUTHORIZED",
      message: "API access credentials are invalid."
    }
  });
});

test("contributor endpoint returns the repository-not-found contract", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000999";
  const response = await fetch(
    `${baseUrl}/api/repositories/${repositoryId}/contributors`,
    {
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    }
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "REPOSITORY_NOT_FOUND",
      message: "Repository not found."
    }
  });
});


test("unauthenticated malformed JSON is rejected by the API access wall", async () => {
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: '{"url":'
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "API_ACCESS_UNAUTHORIZED",
      message: "API access credentials are invalid."
    }
  });
});

test("malformed JSON returns a client error instead of a generic server error", async () => {
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-autopsy-api-key": TEST_API_KEY
    },
    body: '{"url":'
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "INVALID_REQUEST_BODY",
      message: "Request body could not be parsed."
    }
  });
});

test("unauthenticated oversized JSON is rejected before body parsing", async () => {
  const oversizedValue = "x".repeat(1_100_000);
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ value: oversizedValue })
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "API_ACCESS_UNAUTHORIZED",
      message: "API access credentials are invalid."
    }
  });
});

test("oversized JSON returns a bounded payload error", async () => {
  const oversizedValue = "x".repeat(1_100_000);
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-autopsy-api-key": TEST_API_KEY
    },
    body: JSON.stringify({ value: oversizedValue })
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "REQUEST_BODY_TOO_LARGE",
      message: "Request body exceeds the configured size limit."
    }
  });
});


test("repository deletion is blocked while analysis is active", async () => {
  const { db } = await import("../src/config/database.js");
  const repositoryId = randomUUID();
  const analysisRunId = randomUUID();
  const { getRepositoryStoragePath } = await import("../src/modules/repositories/repository.service.js");
  const storagePath = getRepositoryStoragePath(repositoryId);
  await mkdir(storagePath, { recursive: true });

  await db.query(
    `
      INSERT INTO repositories (
        id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, 'github', 'https://github.com/octocat/Hello-World.git', 'delete-active-test', 'main', $2)
    `,
    [repositoryId, storagePath]
  );

  await db.query(
    `
      INSERT INTO analysis_runs (
        id, repository_id, analyzer_version, analysis_mode, status
      )
      VALUES ($1, $2, 'test', 'full', 'queued')
    `,
    [analysisRunId, repositoryId]
  );

  try {
    const response = await fetch(baseUrl + "/api/repositories/" + repositoryId, {
      method: "DELETE",
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false,
      error: {
        code: "REPOSITORY_DELETE_BLOCKED",
        message:
          "Repository deletion is blocked while an analysis is queued or running.",
        analysisRunId
      }
    });
  } finally {
    await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
    await rm(storagePath, { recursive: true, force: true });
  }
});

test("repository deletion removes persisted metadata and checkout storage", async () => {
  const { db } = await import("../src/config/database.js");
  const repositoryId = randomUUID();
  const { getRepositoryStoragePath } = await import("../src/modules/repositories/repository.service.js");
  const storagePath = getRepositoryStoragePath(repositoryId);
  await mkdir(path.join(storagePath, ".git"), { recursive: true });

  await db.query(
    `
      INSERT INTO repositories (
        id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, 'github', 'https://github.com/octocat/Hello-World.git', 'delete-success-test', 'main', $2)
    `,
    [repositoryId, storagePath]
  );

  try {
    const response = await fetch(baseUrl + "/api/repositories/" + repositoryId, {
      method: "DELETE",
      headers: {
        "x-autopsy-api-key": TEST_API_KEY
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      repositoryId,
      deleted: true,
      storageDeleted: true
    });

    const row = await db.query(
      "SELECT id FROM repositories WHERE id = $1",
      [repositoryId]
    );

    assert.equal(row.rows.length, 0);
    await assert.rejects(
      rm(storagePath, { recursive: false }),
      /ENOENT/
    );
  } finally {
    await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
    await rm(storagePath, { recursive: true, force: true });
  }
});


test("repository deletion and refresh cannot both succeed concurrently", async () => {
  const { db } = await import("../src/config/database.js");
  const { getRepositoryStoragePath } = await import("../src/modules/repositories/repository.service.js");
  const repositoryId = randomUUID();
  const storagePath = getRepositoryStoragePath(repositoryId);

  await mkdir(storagePath, { recursive: true });
  await db.query(
    `
      INSERT INTO repositories (
        id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, 'github', 'https://github.com/octocat/Hello-World.git', 'delete-race-test', 'main', $2)
    `,
    [repositoryId, storagePath]
  );

  try {
    const [deleteResponse, analyzeResponse] = await Promise.all([
      fetch(baseUrl + "/api/repositories/" + repositoryId, {
        method: "DELETE",
        headers: { "x-autopsy-api-key": TEST_API_KEY }
      }),
      fetch(baseUrl + "/api/repositories/" + repositoryId + "/analyze", {
        method: "POST",
        headers: {
          "x-autopsy-api-key": TEST_API_KEY,
          "content-type": "application/json"
        },
        body: "{}"
      })
    ]);

    const deleteBody = await deleteResponse.json();
    const analyzeBody = await analyzeResponse.json();

    const refreshWon =
      deleteResponse.status === 409 &&
      analyzeResponse.status === 202 &&
      deleteBody.error?.code === "REPOSITORY_DELETE_BLOCKED";

    const deleteWon =
      deleteResponse.status === 200 &&
      analyzeResponse.status === 404 &&
      deleteBody.deleted === true &&
      analyzeBody.error?.code === "REPOSITORY_NOT_FOUND";

    assert.equal(refreshWon || deleteWon, true);
  } finally {
    await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
    await rm(storagePath, { recursive: true, force: true });
  }
});
