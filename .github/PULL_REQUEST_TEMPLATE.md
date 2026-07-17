<!-- Thanks for contributing! See CONTRIBUTING.md for the full guidelines. -->

## What does this PR do?

<!-- Summary of the change and, for behavior changes, the motivation / linked issue. -->

Fixes #

## How was it verified?

<!-- Tests you added/ran; for end-to-end behavior, what you exercised in the
     compose environment (e.g. "created a pipeline, activated it, restarted
     the forwarding collector, data arrived at the demo backend"). -->

## Checklist

- [ ] Conventional-commit title (e.g. `feat(pipelines): ...`) and DCO sign-off (`git commit -s`)
- [ ] `make gen && git diff --exit-code` passes (no codegen drift)
- [ ] `make test` and `make lint` pass; web changes: `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Tests added/updated for the change
- [ ] Docs updated (`docs/`, README, or Helm values comments) where behavior changed
