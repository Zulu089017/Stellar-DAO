// Commitlint config — enforces Conventional Commits at commit time.
// Types: build, chore, ci, docs, feat, fix, perf, refactor, revert,
//        style, test — per angular convention.
//
// The husky `commit-msg` hook invokes commitlint on every commit.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [2, 'always', 100],
    'footer-max-line-length': [2, 'always', 100],
  },
};
