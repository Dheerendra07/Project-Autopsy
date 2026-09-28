export interface FilePair {
  pathA: string;
  pathB: string;
}

export function canonicalFilePair(pathA: string, pathB: string): FilePair | null {
  if (!pathA || !pathB || pathA === pathB) {
    return null;
  }

  return pathA < pathB
    ? { pathA, pathB }
    : { pathA: pathB, pathB: pathA };
}

export function buildCouplingPairs(
  filePaths: string[]
): FilePair[] {
  const uniquePaths = [...new Set(filePaths)]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const pairs: FilePair[] = [];

  for (let i = 0; i < uniquePaths.length; i += 1) {
    for (let j = i + 1; j < uniquePaths.length; j += 1) {
      pairs.push({
        pathA: uniquePaths[i]!,
        pathB: uniquePaths[j]!
      });
    }
  }

  return pairs;
}
