export type RepositorySourceType = "local" | "github" | "gitlab" | "bitbucket" | "zip";

export interface RepositorySource {
  type: RepositorySourceType;
  url?: string;
  branch?: string;
  commitSha?: string;
  localPath?: string;
}

export interface RepositoryMetadata {
  name: string;
  defaultBranch: string;
  headSha: string;
  commitCount: number;
  isShallow: boolean;
}
