import {
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SimpleGit } from "simple-git";

const ASKPASS_SCRIPT = [
  `const prompt = String(process.argv[2] || "").toLowerCase();`,
  `const username = process.env.AUTOPSY_GIT_ACCESS_USERNAME || "";`,
  `const token = process.env.AUTOPSY_GIT_ACCESS_TOKEN || "";`,
  `process.stdout.write(prompt.includes("username") ? username : token);`
].join("\n");

function getGitCredentialUsername(hostname: string): string {
  switch (hostname.toLowerCase()) {
    case "github.com":
      return "x-access-token";
    case "gitlab.com":
      return "oauth2";
    case "bitbucket.org":
      return "x-token-auth";
    default:
      return "git";
  }
}

export async function withRepositoryAccess<T>(
  git: SimpleGit,
  remoteUrl: URL,
  accessToken: string | undefined,
  operation: (authenticatedGit: SimpleGit) => Promise<T>
): Promise<T> {
  if (!accessToken) {
    return operation(git);
  }

  const askPassPath = path.join(
    tmpdir(),
    `project-autopsy-askpass-${randomUUID()}.cjs`
  );

  await writeFile(askPassPath, ASKPASS_SCRIPT, {
    encoding: "utf8",
    mode: 0o600
  });

  const authenticatedGit = git
    .env(
      "GIT_ASKPASS",
      `${JSON.stringify(process.execPath)} ${JSON.stringify(askPassPath)}`
    )
    .env("GIT_ASKPASS_REQUIRE", "force")
    .env("GIT_TERMINAL_PROMPT", "0")
    .env(
      "AUTOPSY_GIT_ACCESS_USERNAME",
      getGitCredentialUsername(remoteUrl.hostname)
    )
    .env("AUTOPSY_GIT_ACCESS_TOKEN", accessToken);

  try {
    return await operation(authenticatedGit);
  } finally {
    await rm(askPassPath, {
      force: true
    });
  }
}
