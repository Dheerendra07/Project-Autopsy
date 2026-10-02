import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://autopsy:autopsy_dev_password@127.0.0.1:5432/project_autopsy";
process.env.REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
process.env.API_RATE_LIMIT_MAX_REQUESTS = "1000";
process.env.API_RATE_LIMIT_HEAVY_MAX_REQUESTS = "1000";

let server: Server;
let baseUrl: string;
let testUserId = "";
let testUserEmail = "";
let authCookie = "";
let csrfToken = "";

function authHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    cookie: authCookie,
    "x-autopsy-csrf-token": csrfToken,
    ...extra
  };
}

function parseCookie(header: string, name: string): string {
  const match = header.match(
    new RegExp("(?:^|;\\s*|,\\s*)" + name + "=([^;]+)")
  );
  return match?.[1] ?? "";
}

before(async () => {
  const { app } = await import("../src/app.js");

  server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));

    instance.once("error", reject);
  });

  const address = server.address();

  assert.ok(address);
  assert.equal(typeof address, "object");

  const info = address as AddressInfo;
  baseUrl = `http://127.0.0.1:${info.port}`;

  testUserEmail = "contract-" + randomUUID() + "@example.com";
  const registerResponse = await fetch(baseUrl + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: testUserEmail,
      password: "Contract-test-password-123456"
    })
  });
  assert.equal(registerResponse.status, 201);
  const registerBody = await registerResponse.json() as {
    user: { id: string };
    requiresEmailVerification?: boolean;
  };
  assert.ok(registerBody.user?.id);
  assert.equal(registerBody.requiresEmailVerification, false);
  const setCookie = registerResponse.headers.get("set-cookie") ?? "";
  const sessionValue = parseCookie(setCookie, "autopsy_session");
  const csrfValue = parseCookie(setCookie, "autopsy_csrf");
  authCookie = "autopsy_session=" + sessionValue + "; autopsy_csrf=" + csrfValue;
  csrfToken = csrfValue;
  testUserId = registerBody.user.id;
  assert.ok(authCookie);
  assert.ok(csrfToken);
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

  if (testUserId) {
    await db.query("DELETE FROM users WHERE id = $1", [testUserId]);
  }

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

test("API routes reject requests without a signed-in account", async () => {
  const response = await fetch(`${baseUrl}/api/`);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "AUTH_REQUIRED",
      message: "A signed-in account is required."
    }
  });
});

test("API root accepts the authenticated account session", async () => {
  const response = await fetch(baseUrl + "/api/", {
    headers: authHeaders()
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: "Project Autopsy API",
    version: "0.1.0"
  });
});test("authenticated unknown API routes do not reflect query strings", async () => {
  const response = await fetch(
    baseUrl + "/api/not-a-real-route?secret=should-not-echo",
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
      }
    }
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found: GET /api/not-a-real-route"
    }
  });
});


test("authenticated unknown API routes reach the API not-found contract", async () => {
  const response = await fetch(`${baseUrl}/api/not-a-real-route`, {
    headers: {
      "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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



test("protected repository routes reject malformed UUIDs with the repository-id contract", async () => {
  const response = await fetch(
    baseUrl + "/api/repositories/not-a-uuid/commits",
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
      }
    }
  );

  assert.equal(response.status, 400);
  const body = await response.json() as {
    success: boolean;
    error: { code: string; message: string };
  };

  assert.equal(body.success, false);
  assert.equal(body.error.code, "REPOSITORY_ID_INVALID");
  assert.equal(body.error.message, "Repository id is invalid.");
});



test("protected repository access takes precedence over query validation for unknown IDs", async () => {
  for (const query of ["page=0&limit=50", "page=1&limit=101"]) {
    const response = await fetch(
      baseUrl + "/api/repositories/00000000-0000-4000-8000-000000000999/commits?" + query,
      {
        headers: {
          "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
        }
      }
    );

    assert.equal(response.status, 404);
    const body = await response.json() as {
      error: { code: string };
    };
    assert.equal(body.error.code, "REPOSITORY_NOT_FOUND");
  }
});

test("commit history is newest-first while the timeline remains chronological", async () => {
  const { db } = await import("../src/config/database.js");
  const repositoryId = randomUUID();
  const newestSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const middleSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const oldestSha = "cccccccccccccccccccccccccccccccccccccccc";

  await db.query(
    `
      INSERT INTO repositories (
        id, owner_user_id, source_type, source_url, name, tracked_branch, head_sha
      )
      VALUES ($1, $2, 'github', 'https://github.com/octocat/Hello-World.git', 'commit-order-test', 'main', $3)
    `,
    [repositoryId, testUserId, newestSha]
  );

  await db.query(
    `
      INSERT INTO commits (
        repository_id, sha, subject, committed_at, files_changed, additions, deletions
      )
      VALUES
        ($1, $2, 'newest commit', '2026-03-03T00:00:00Z', 1, 3, 1),
        ($1, $3, 'middle commit', '2026-03-02T00:00:00Z', 2, 4, 2),
        ($1, $4, 'oldest commit', '2026-03-01T00:00:00Z', 3, 5, 3)
    `,
    [repositoryId, newestSha, middleSha, oldestSha]
  );

  try {
    const commitsResponse = await fetch(
      baseUrl + "/api/repositories/" + repositoryId + "/commits?page=1&limit=3",
      { headers: { "cookie": authCookie, "x-autopsy-csrf-token": csrfToken } }
    );
    assert.equal(commitsResponse.status, 200);
    const commitsBody = await commitsResponse.json() as {
      commits: Array<{ sha: string; subject: string }>;
    };
    assert.deepEqual(
      commitsBody.commits.map((commit) => commit.sha),
      [newestSha, middleSha, oldestSha]
    );

    const timelineResponse = await fetch(
      baseUrl + "/api/repositories/" + repositoryId + "/timeline?page=1&limit=3",
      { headers: { "cookie": authCookie, "x-autopsy-csrf-token": csrfToken } }
    );
    assert.equal(timelineResponse.status, 200);
    const timelineBody = await timelineResponse.json() as {
      events: Array<{ sha: string; subject: string }>;
    };
    assert.deepEqual(
      timelineBody.events.map((event) => event.sha),
      [oldestSha, middleSha, newestSha]
    );
  } finally {
    await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
  }
});


test("unknown repositories return not-found before runtime filter validation", async () => {
  const response = await fetch(
    baseUrl + "/api/repositories/00000000-0000-4000-8000-000000000999/runtime/telemetry?from=2026-09-30T02:00:00.000Z&to=2026-09-30T01:00:00.000Z",
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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



test("unknown repositories return not-found before revision filter validation", async () => {
  const response = await fetch(
    baseUrl + "/api/repositories/00000000-0000-4000-8000-000000000999/runtime/telemetry?revisionSha=abc",
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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



test("unknown repositories return not-found before report query validation", async () => {
  for (const route of [
    "/api/repositories/00000000-0000-4000-8000-000000000999/report?limit=0",
    "/api/repositories/00000000-0000-4000-8000-000000000999/report?limit=51",
    "/api/repositories/00000000-0000-4000-8000-000000000999/interpretation?limit=0",
    "/api/repositories/00000000-0000-4000-8000-000000000999/interpretation?limit=51"
  ]) {
    const response = await fetch(baseUrl + route, {
      headers: {
        "cookie": authCookie,
        "x-autopsy-csrf-token": csrfToken
      }
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      error: {
        code: "REPOSITORY_NOT_FOUND",
        message: "Repository not found."
      }
    });
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
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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

test("authenticated account sessions are accepted by protected routes", async () => {
  const response = await fetch(baseUrl + "/api/", {
    headers: authHeaders()
  });
  assert.equal(response.status, 200);
});test("invalid session credentials are rejected", async () => {
  const response = await fetch(baseUrl + "/api/", {
    headers: { cookie: "autopsy_session=invalid-session" }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "AUTH_REQUIRED",
      message: "A signed-in account is required."
    }
  });
});test("analysis status returns repository-not-found for an unknown repository", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000999";
  const analysisRunId = "00000000-0000-4000-8000-000000000998";

  const response = await fetch(
    `${baseUrl}/api/repositories/${repositoryId}/analysis/${analysisRunId}`,
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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



test("contributor endpoint remains behind session auth", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000999";
  const response = await fetch(
    `${baseUrl}/api/repositories/${repositoryId}/contributors`
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "AUTH_REQUIRED",
      message: "A signed-in account is required."
    }
  });
});

test("contributor endpoint returns the repository-not-found contract", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000999";
  const response = await fetch(
    `${baseUrl}/api/repositories/${repositoryId}/contributors`,
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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


test("unauthenticated malformed JSON is rejected by the body parser before session auth", async () => {
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json"
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

test("malformed JSON returns a client error instead of a generic server error", async () => {
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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

test("unauthenticated oversized JSON is rejected by the body parser with a bounded response", async () => {
  const oversizedValue = "x".repeat(1_100_000);
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json"
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

test("oversized JSON returns a bounded payload error", async () => {
  const oversizedValue = "x".repeat(1_100_000);
  const response = await fetch(baseUrl + "/api/repositories/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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


test("analysis status hides internal failure paths from API consumers", async () => {
  const { db } = await import("../src/config/database.js");
  const { getRepositoryStoragePath } =
    await import("../src/modules/repositories/repository.service.js");
  const repositoryId = randomUUID();
  const analysisRunId = randomUUID();
  const storagePath = getRepositoryStoragePath(repositoryId);
  const internalPath = storagePath + "/.git/index";

  await db.query(
    `
      INSERT INTO repositories (
        id, owner_user_id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, $2, 'github', 'https://github.com/octocat/Hello-World.git', 'analysis-error-sanitize-test', 'main', $3)
    `,
    [repositoryId, testUserId, storagePath]
  );

  await db.query(
    `
      INSERT INTO analysis_runs (
        id, repository_id, analyzer_version, analysis_mode, status, error_message, completed_at
      )
      VALUES ($1, $2, 'test', 'full', 'failed', $3, NOW())
    `,
    [analysisRunId, repositoryId, `Git clone failed at ${internalPath}: ${"x".repeat(1_200)}`]
  );

  try {
    const response = await fetch(
      baseUrl +
        "/api/repositories/" +
        repositoryId +
        "/analysis/" +
        analysisRunId,
      {
        headers: {
          "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
        }
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json() as {
      analysis: {
        errorMessage: string | null;
      };
    };

    assert.equal(body.analysis.errorMessage?.includes(storagePath), false);
    assert.equal(body.analysis.errorMessage?.includes("<managed-path>"), true);
    assert.ok((body.analysis.errorMessage?.length ?? 0) <= 1_000);
  } finally {
    await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
  }
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
        id, owner_user_id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, $2, 'github', 'https://github.com/octocat/Hello-World.git', 'delete-active-test', 'main', $3)
    `,
    [repositoryId, testUserId, storagePath]
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
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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
        id, owner_user_id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, $2, 'github', 'https://github.com/octocat/Hello-World.git', 'delete-success-test', 'main', $3)
    `,
    [repositoryId, testUserId, storagePath]
  );

  try {
    const response = await fetch(baseUrl + "/api/repositories/" + repositoryId, {
      method: "DELETE",
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      repositoryId,
      deleted: true,
      storageDeleted: true,
      cleanupPending: false
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
        id, owner_user_id, source_type, source_url, name, tracked_branch, storage_path
      )
      VALUES ($1, $2, 'github', 'https://github.com/octocat/Hello-World.git', 'delete-race-test', 'main', $3)
    `,
    [repositoryId, testUserId, storagePath]
  );

  try {
    const [deleteResponse, analyzeResponse] = await Promise.all([
      fetch(baseUrl + "/api/repositories/" + repositoryId, {
        method: "DELETE",
        headers: { "cookie": authCookie, "x-autopsy-csrf-token": csrfToken }
      }),
      fetch(baseUrl + "/api/repositories/" + repositoryId + "/analyze", {
        method: "POST",
        headers: {
          "cookie": authCookie, "x-autopsy-csrf-token": csrfToken,
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


test("repository storage cleanup retry removes pending managed storage", async () => {
  const { db } = await import("../src/config/database.js");
  const { getRepositoryStoragePath, retryRepositoryStorageCleanup } =
    await import("../src/modules/repositories/repository.service.js");
  const repositoryId = randomUUID();
  const storagePath = getRepositoryStoragePath(repositoryId);

  await mkdir(path.join(storagePath, "nested"), { recursive: true });

  await db.query(
    `
      INSERT INTO repository_storage_cleanup (
        repository_id, storage_path
      )
      VALUES ($1, $2)
    `,
    [repositoryId, storagePath]
  );

  try {
    const result = await retryRepositoryStorageCleanup(20);

    assert.equal(result.attempted, 1);
    assert.equal(result.cleaned, 1);
    assert.equal(result.pending, 0);

    await assert.rejects(
      rm(storagePath, { recursive: false }),
      /ENOENT/
    );

    const row = await db.query(
      "SELECT repository_id FROM repository_storage_cleanup WHERE repository_id = $1",
      [repositoryId]
    );

    assert.equal(row.rows.length, 0);
  } finally {
    await db.query(
      "DELETE FROM repository_storage_cleanup WHERE repository_id = $1",
      [repositoryId]
    );
    await rm(storagePath, { recursive: true, force: true });
  }
});

test("repository storage cleanup retains failed paths for retry without throwing", async () => {
  const { db } = await import("../src/config/database.js");
  const { retryRepositoryStorageCleanup } =
    await import("../src/modules/repositories/repository.service.js");
  const repositoryId = randomUUID();
  const invalidPath = path.resolve(process.cwd(), "..");

  await db.query(
    `
      INSERT INTO repository_storage_cleanup (
        repository_id, storage_path
      )
      VALUES ($1, $2)
    `,
    [repositoryId, invalidPath]
  );

  try {
    const result = await retryRepositoryStorageCleanup(20);

    assert.equal(result.attempted, 1);
    assert.equal(result.cleaned, 0);
    assert.equal(result.pending, 1);

    const row = await db.query<{ attempts: number; last_error: string | null }>(
      `
        SELECT attempts, last_error
        FROM repository_storage_cleanup
        WHERE repository_id = $1
      `,
      [repositoryId]
    );

    assert.equal(row.rows[0]?.attempts, 1);
    assert.match(row.rows[0]?.last_error ?? "", /outside the managed storage root/);
  } finally {
    await db.query(
      "DELETE FROM repository_storage_cleanup WHERE repository_id = $1",
      [repositoryId]
    );
  }
});


test("analysis-runs endpoint returns the repository-not-found contract", async () => {
  const response = await fetch(
    baseUrl +
      "/api/repositories/00000000-0000-4000-8000-000000000999/analysis-runs",
    {
      headers: {
        "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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

test("unknown repositories return not-found before analysis-run pagination validation", async () => {
  for (const limit of [0, 51]) {
    const response = await fetch(
      baseUrl +
        "/api/repositories/00000000-0000-4000-8000-000000000999/analysis-runs?limit=" +
        limit,
      {
        headers: {
          "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
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
  }
});



test("API rate-limit configuration is visible through bounded response headers", async () => {
  const response = await fetch(baseUrl + "/api/", {
    headers: {
      "cookie": authCookie, "x-autopsy-csrf-token": csrfToken
    }
  });

  assert.notEqual(response.headers.get("x-ratelimit-limit"), null);
  assert.notEqual(response.headers.get("x-ratelimit-remaining"), null);
  assert.notEqual(response.headers.get("x-ratelimit-reset"), null);
});
