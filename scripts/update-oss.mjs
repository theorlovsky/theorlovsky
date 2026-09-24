// Rewrites the block between <!-- oss:start --> and <!-- oss:end --> in README.md
// with my latest merged pull requests to repositories I don't own.
// Run by .github/workflows/update-readme.yml; locally: GITHUB_TOKEN=... node scripts/update-oss.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const USER = 'theorlovsky';
const LIMIT = 5;
const README = new URL('../README.md', import.meta.url);
const START = '<!-- oss:start -->';
const END = '<!-- oss:end -->';

async function fetchMergedPRs() {
  const q = `author:${USER} is:pr is:merged is:public -user:${USER}`;
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const items = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    items.push(...data.items);
    if (items.length >= data.total_count || data.items.length === 0) break;
  }
  return items;
}

export function render(prs) {
  const repos = new Set(prs.map((pr) => pr.repository_url));
  const latest = [...prs]
    .sort((a, b) => Date.parse(b.pull_request.merged_at) - Date.parse(a.pull_request.merged_at))
    .slice(0, LIMIT);

  const escape = (s) => s.replace(/([\\`*_[\]<>|])/g, '\\$1');
  const month = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const lines = latest.map((pr) => {
    const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
    return `- [${escape(pr.title)}](${pr.html_url}) in [${repo}](https://github.com/${repo}) · ${month(pr.pull_request.merged_at)}`;
  });

  const search = `https://github.com/pulls?q=${encodeURIComponent(`is:pr is:merged author:${USER} -user:${USER}`)}`;
  return [
    `**[${prs.length} merged PRs](${search})** across ${repos.size} projects. Latest:`,
    '',
    ...lines,
  ].join('\n');
}

export function inject(readme, block) {
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from === -1 || to === -1 || to < from) throw new Error(`README is missing ${START} … ${END}`);
  return `${readme.slice(0, from + START.length)}\n${block}\n${readme.slice(to)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prs = await fetchMergedPRs();
  const readme = readFileSync(README, 'utf8');
  const next = inject(readme, render(prs));
  if (next === readme) {
    console.log('README is up to date');
  } else {
    writeFileSync(README, next);
    console.log(`README updated: ${prs.length} merged PRs`);
  }
}
