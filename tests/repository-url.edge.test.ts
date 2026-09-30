import assert from "node:assert/strict";
import test from "node:test";

import { validateRemoteRepositoryUrl } from "../src/modules/repositories/repository-url.js";

test("accepts the three supported Git hosts", () => {
  for (const url of [
    "https://github.com/owner/repo.git",
    "https://gitlab.com/owner/repo",
    "https://bitbucket.org/owner/repo.git"
  ]) {
    assert.doesNotThrow(() => validateRemoteRepositoryUrl(url));
  }
});

test("normalizes the repository hostname and trailing slashes", () => {
  const parsed = validateRemoteRepositoryUrl(
    "https://GITHUB.com/owner/repo///"
  );

  assert.equal(parsed.hostname, "github.com");
  assert.equal(parsed.pathname, "/owner/repo");
});

test("rejects plain HTTP", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl("http://github.com/owner/repo"),
    /Only HTTPS repository URLs are allowed\./
  );
});

test("rejects unsupported hosts", () => {
  for (const host of [
    "example.com",
    "github.enterprise.example.com",
    "raw.githubusercontent.com",
    "localhost"
  ]) {
    assert.throws(
      () => validateRemoteRepositoryUrl(`https://${host}/owner/repo`),
      /Repository host is not supported\./
    );
  }
});

test("rejects embedded username credentials", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://user@github.com/owner/repo"
    ),
    /Repository credentials must not be embedded/
  );
});

test("rejects embedded username and password credentials", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://user:password@github.com/owner/repo"
    ),
    /Repository credentials must not be embedded/
  );
});

test("rejects query parameters", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://github.com/owner/repo?token=secret"
    ),
    /query parameters or fragments/
  );
});

test("rejects URL fragments", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://github.com/owner/repo#branch"
    ),
    /query parameters or fragments/
  );
});

test("rejects query plus fragment together", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://github.com/owner/repo?x=1#branch"
    ),
    /query parameters or fragments/
  );
});

test("rejects empty input", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(""),
    /Invalid URL/
  );
});

test("rejects whitespace-only input", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl("   "),
    /Invalid URL/
  );
});

test("rejects malformed non-URL strings", () => {
  for (const value of [
    "github.com/owner/repo",
    "not-a-url",
    "https://",
    "ftp://github.com/owner/repo"
  ]) {
    assert.throws(() => validateRemoteRepositoryUrl(value));
  }
});

test("does not treat subdomains as approved repository hosts", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://github.com.evil.example/owner/repo"
    ),
    /Repository host is not supported/
  );
});

test("does not allow credential-looking path data to become URL credentials", () => {
  const parsed = validateRemoteRepositoryUrl(
    "https://github.com/owner/user%40example.com-repo"
  );

  assert.equal(parsed.username, "");
  assert.equal(parsed.password, "");
  assert.equal(parsed.hostname, "github.com");
});



test("rejects repository-host root and owner-only paths", () => {
  for (const url of [
    "https://github.com",
    "https://github.com/",
    "https://github.com/owner",
    "https://bitbucket.org/workspace"
  ]) {
    assert.throws(
      () => validateRemoteRepositoryUrl(url),
      /owner\/group and repository name/
    );
  }

  assert.throws(
    () => validateRemoteRepositoryUrl("https://gitlab.com/group"),
    /owner\/group and repository name/
  );
});

test("rejects extra path segments for GitHub and Bitbucket", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://github.com/owner/repo/extra"
    ),
    /invalid path for its Git provider/
  );

  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://bitbucket.org/workspace/repo/extra"
    ),
    /invalid path for its Git provider/
  );
});

test("allows nested GitLab group paths", () => {
  assert.doesNotThrow(() =>
    validateRemoteRepositoryUrl(
      "https://gitlab.com/group/subgroup/project.git"
    )
  );
});

test("rejects dot path traversal segments after URL decoding", () => {
  for (const segment of [".", "..", "%2e", "%2e%2e"]) {
    assert.throws(
      () => validateRemoteRepositoryUrl(
        "https://github.com/owner/" + segment
      ),
      /invalid path segment|invalid path for its Git provider/
    );
  }
});

test("rejects malformed percent-encoding in the repository path", () => {
  assert.throws(
    () => validateRemoteRepositoryUrl(
      "https://github.com/owner/repo%ZZ"
    ),
    /invalid URL encoding/i
  );
});

test("preserves nested repository paths for hosted Git providers", () => {
  const parsed = validateRemoteRepositoryUrl(
    "https://gitlab.com/group/subgroup/repo.git"
  );

  assert.equal(parsed.pathname, "/group/subgroup/repo.git");
});

test("preserves percent-encoded path characters rather than rewriting them", () => {
  const parsed = validateRemoteRepositoryUrl(
    "https://github.com/owner/repo%2Farchive"
  );

  assert.equal(parsed.hostname, "github.com");
  assert.equal(parsed.pathname, "/owner/repo%2Farchive");
});
