import { REPO } from './site';

let cached: Promise<number | undefined> | undefined;

/**
 * Stargazer count fetched once at build time. Returns undefined on any failure so
 * the page renders without a number instead of failing the build. A token
 * (CI's GITHUB_TOKEN) only raises the rate limit; it is never logged.
 */
export function getStarCount(): Promise<number | undefined> {
  cached ??= fetchStars();
  return cached;
}

async function fetchStars(): Promise<number | undefined> {
  const token = import.meta.env['GITHUB_TOKEN'] as string | undefined;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'awesome-rag-production-landing',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`github: star count unavailable (HTTP ${response.status})`);
      return undefined;
    }
    const data = (await response.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === 'number'
      ? data.stargazers_count
      : undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown error';
    console.warn(`github: star count unavailable (${reason})`);
    return undefined;
  }
}
