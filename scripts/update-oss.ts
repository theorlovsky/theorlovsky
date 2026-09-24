/**
 * Rewrites the block between `<!-- oss:start -->` and `<!-- oss:end -->` in README.md
 * with my latest merged pull requests to repositories I don't own.
 *
 * Run by .github/workflows/update-readme.yml; locally: `GITHUB_TOKEN=... npm run update-oss`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const USER = 'theorlovsky';
const LATEST_LIMIT = 5;
const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url));
const START_MARKER = '<!-- oss:start -->';
const END_MARKER = '<!-- oss:end -->';
const API_REPOS_PREFIX = 'https://api.github.com/repos/';

/** The subset of a GitHub search result item this script reads. */
export interface PullRequest {
  title: string;
  html_url: string;
  repository_url: string;
  pull_request: { merged_at: string | null };
}

interface SearchResponse {
  total_count: number;
  items: PullRequest[];
}

interface MergedPullRequest extends PullRequest {
  pull_request: { merged_at: string };
}

async function fetchMergedPullRequests(token: string | undefined): Promise<PullRequest[]> {
  const query = `author:${USER} is:pr is:merged is:public -user:${USER}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const pullRequests: PullRequest[] = [];
  for (let page = 1; ; page++) {
    const url = new URL('https://api.github.com/search/issues');
    url.search = new URLSearchParams({ q: query, per_page: '100', page: String(page) }).toString();

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}: ${await response.text()}`);
    }

    const { items, total_count: totalCount } = (await response.json()) as SearchResponse;
    pullRequests.push(...items);
    if (items.length === 0 || pullRequests.length >= totalCount) {
      return pullRequests;
    }
  }
}

function isMerged(pullRequest: PullRequest): pullRequest is MergedPullRequest {
  return pullRequest.pull_request.merged_at !== null;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, '\\$&');
}

function formatMonth(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function repositoryName(pullRequest: PullRequest): string {
  return pullRequest.repository_url.slice(API_REPOS_PREFIX.length);
}

/** Renders the Markdown that goes between the markers. */
export function renderBlock(pullRequests: readonly PullRequest[]): string {
  const repositories = new Set(pullRequests.map(repositoryName));
  const latest = pullRequests
    .filter(isMerged)
    .toSorted((a, b) => Date.parse(b.pull_request.merged_at) - Date.parse(a.pull_request.merged_at))
    .slice(0, LATEST_LIMIT);

  const lines = latest.map((pullRequest) => {
    const repository = repositoryName(pullRequest);
    const title = escapeMarkdown(pullRequest.title);
    const month = formatMonth(pullRequest.pull_request.merged_at);
    return `- [${title}](${pullRequest.html_url}) in [${repository}](https://github.com/${repository}) · ${month}`;
  });

  const searchUrl = new URL('https://github.com/pulls');
  searchUrl.searchParams.set('q', `is:pr is:merged author:${USER} -user:${USER}`);

  return [
    `**[${pullRequests.length} merged PRs](${searchUrl})** across ${repositories.size} projects. Latest:`,
    '',
    ...lines,
  ].join('\n');
}

/** Replaces everything between the markers with `block`, keeping the markers. */
export function injectBlock(readme: string, block: string): string {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README is missing ${START_MARKER} … ${END_MARKER}`);
  }
  return `${readme.slice(0, start + START_MARKER.length)}\n\n${block}\n\n${readme.slice(end)}`;
}

async function main(): Promise<void> {
  const pullRequests = await fetchMergedPullRequests(process.env.GITHUB_TOKEN);
  const readme = await readFile(README_PATH, 'utf8');
  const updated = injectBlock(readme, renderBlock(pullRequests));

  if (updated === readme) {
    console.log('README is up to date');
    return;
  }
  await writeFile(README_PATH, updated);
  console.log(`README updated: ${pullRequests.length} merged PRs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
