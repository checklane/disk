# checklane/disk

The GitHub Action `uses: checklane/disk@v1`. It mounts a disk of the repository, named by
`key`, at `path` for the rest of the job, on Checklane's runners. This repository is public:
everything in it, its commits and its pull requests are read by Checklane's customers.

## How it works

The action is a thin client. The disk itself is put in place by the Checklane machine the
job runs on; the action only asks for it.

1. `main` (`src/main.ts` → `src/mount.ts`) reads the inputs `key` and `path`, makes the
   path absolute (`~` is `$HOME`, a relative path is relative to `$GITHUB_WORKSPACE`), and
   posts `{"key", "path"}` to `$CHECKLANE_DISK_URL/mount` with
   `Authorization: Bearer $CHECKLANE_DISK_TOKEN`. The machine answers
   `{"mounted": bool, "restored": bool, "skipped"?: string}`. On success it saves `key` as
   step state.
2. `post` (`src/post.ts` → `src/unmount.ts`) posts `{"key"}` to
   `$CHECKLANE_DISK_URL/unmount`, answered `{"unmounted": bool, "skipped"?: string}`. The
   machine unmounts every disk at the end of the job anyway; this only does it sooner.

Both variables are set only on Checklane machines. Without them the step warns and does
nothing. The machine decides everything else: the 4-disk limit, billing, which runs keep
what they wrote. Its answers' `skipped` says why a disk wasn't mounted; print it as given.

## Rules

- **Never fail the job.** Every problem is a `::warning::` and the job runs without the
  disk. Don't throw out of `mount` or `unmount`, don't set `process.exitCode`.
- **No runtime dependencies.** The runner's Node 24 has `fetch`; workflow commands are lines
  on stdout (`src/lib.ts`). `dependencies` in `package.json` stays empty, so `dist/` is
  plain `tsc` output, not a bundle.
- **`dist/` is committed.** The runner runs `dist/main.js` and `dist/post.js` straight from
  the tag. Run `pnpm build` after changing `src/` and commit `dist/` with it; CI fails when
  it is out of date.
- **The machine's API is a contract.** The routes and fields above are served by Checklane's
  machine agent. Change them only together with it, and keep old fields working: tags that
  customers pin keep running against new machines.
- **Words people read** (warnings, notices, README) say what happens to the user's job, in
  plain sentences: "Disk go-build isn’t mounted, so the job runs without it: …".

## Layout

- `action.yml`: the action's inputs and entry points.
- `src/lib.ts`: inputs, paths, state, workflow commands, the request to the machine.
- `src/mount.ts`, `src/unmount.ts`: the two steps. `src/main.ts`, `src/post.ts` only call them.
- `test/disk.test.ts`: the steps against a fake machine, with `node:test`.
- `dist/`: the build, committed.
- `.github/`: workflows, Dependabot and the logos the README shows.

## Commands

```sh
pnpm install
pnpm check    # typecheck, lint, format check and tests
pnpm format   # fix formatting
pnpm build    # write dist/
```

Node 24 runs the TypeScript tests directly (type stripping), so source files import each
other with `.ts` extensions and use only erasable syntax (no `enum`, no `namespace`);
`tsc` rewrites the extensions to `.js` in `dist/`. Lint is oxlint, formatting is oxfmt.

## Workflows

- `ci.yml`, on every pull request and push to `main`: types, lint, formatting, tests and
  `dist/` up to date (when it isn't, the run uploads the built `dist/` to take from it).
  Then the action itself off Checklane, where it must warn and let the job go on.
- `e2e.yml`, on pushes to `main`, daily and by hand: the action on a `checklane-2vcpu`
  runner, with real disks. Four mount, a fifth and a repeated key are skipped, and each disk
  says which run wrote it last. It needs the machines to serve disks, so it fails when they
  don't.
- `release.yml`, by hand: releases a version. See below.
- Dependabot bumps the workflows' actions and the dev tools weekly, after a week's cooldown.
  Actions are pinned to a commit with the version in a comment; keep it that way.

## Releasing

Customers use the major tag `v1`. After a change is merged to `main`, run the Release
workflow with the next version (`v1.2.0`): it checks `main` again, tags it, writes the
GitHub release and moves `v1` to it. A change that breaks a workflow that works today gets a
new major version instead, with "Move the major tag" off until it's ready.

## Commits and pull requests

Conventional Commits: `type(scope): summary`, lower-case, imperative, no trailing period.

Never put customer data here: no customer names, repositories, organizations, logs or links
from support or incidents, in code, tests, commits or pull requests. Use made-up examples.
