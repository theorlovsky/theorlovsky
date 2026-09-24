import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { injectBlock, renderBlock, type PullRequest } from './update-oss.ts';

function pullRequest(repository: string, number: number, title: string, mergedAt: string | null): PullRequest {
  return {
    title,
    html_url: `https://github.com/${repository}/pull/${number}`,
    repository_url: `https://api.github.com/repos/${repository}`,
    pull_request: { merged_at: mergedAt },
  };
}

describe('renderBlock', () => {
  const pullRequests = [
    pullRequest('salesforce/akita', 437, 'feat: selective persist-state', '2020-06-01T00:00:00Z'),
    pullRequest('taiga-family/taiga-ui', 3007, 'feat(kit): tuiTextfieldAppearance', '2022-11-10T00:00:00Z'),
    pullRequest('salesforce/akita', 635, 'fix: StateHistoryPlugin update', '2021-03-15T00:00:00Z'),
  ];

  it('summarises totals and lists the latest PRs first', () => {
    assert.equal(
      renderBlock(pullRequests),
      [
        '**[3 merged PRs](https://github.com/pulls?q=is%3Apr+is%3Amerged+author%3Atheorlovsky+-user%3Atheorlovsky)** across 2 projects. Latest:',
        '',
        '- [feat(kit): tuiTextfieldAppearance](https://github.com/taiga-family/taiga-ui/pull/3007) in [taiga-family/taiga-ui](https://github.com/taiga-family/taiga-ui) · Nov 2022',
        '- [fix: StateHistoryPlugin update](https://github.com/salesforce/akita/pull/635) in [salesforce/akita](https://github.com/salesforce/akita) · Mar 2021',
        '- [feat: selective persist-state](https://github.com/salesforce/akita/pull/437) in [salesforce/akita](https://github.com/salesforce/akita) · Jun 2020',
      ].join('\n'),
    );
  });

  it('lists at most five PRs', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      pullRequest('ngxf/platform', i, `PR ${i}`, `2020-0${i + 1}-01T00:00:00Z`),
    );
    const listed = renderBlock(many)
      .split('\n')
      .filter((line) => line.startsWith('- '));
    assert.equal(listed.length, 5);
    assert.match(listed[0] ?? '', /PR 7/);
  });

  it('escapes Markdown in titles', () => {
    const block = renderBlock([pullRequest('a/b', 1, 'fix [x] | `y`', '2020-01-01T00:00:00Z')]);
    assert.match(block, /\[fix \\\[x\\\] \\\| \\`y\\`\]/);
  });

  it('skips PRs without a merge date', () => {
    const block = renderBlock([pullRequest('a/b', 1, 'unmerged', null)]);
    assert.doesNotMatch(block, /unmerged/);
  });
});

describe('injectBlock', () => {
  it('replaces the content between the markers', () => {
    const readme = 'before\n<!-- oss:start -->\nold\n<!-- oss:end -->\nafter';
    assert.equal(injectBlock(readme, 'new'), 'before\n<!-- oss:start -->\n\nnew\n\n<!-- oss:end -->\nafter');
  });

  it('throws when the markers are missing', () => {
    assert.throws(() => injectBlock('no markers', 'new'), /missing/);
  });
});
