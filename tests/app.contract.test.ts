import assert from "node:assert/strict";
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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test("health endpoint stays public", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: "project-autopsy-api",
    status: "healthy",
    timestamp: assert.any
  });
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
