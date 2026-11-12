# Checklane disk

Keeps a directory between your jobs on [Checklane](https://checklane.sh). Put this step
before the step that fills the directory. The next job that uses the same key starts with
everything the last one left there, with nothing to download or unpack.

```yaml
jobs:
  build:
    runs-on: checklane-4vcpu
    steps:
      - uses: actions/checkout@v5
      - uses: checklane/disk@v1
        with:
          key: go-build
          path: ~/.cache/go-build
      - run: go build ./...
```

The disk is mounted at `path` from this step until the job ends. When a trusted job
finishes (see below), Checklane keeps what the disk holds for the next job of the
repository that uses the same key.

## Inputs

- **`key`** (required): the disk’s name, up to 128 characters. Jobs of the repository that
  use the same key get the same disk.
- **`path`** (required): the directory the disk is mounted at. `~` is the runner’s home
  directory, and a relative path is relative to the workspace. The directory is created if
  it isn’t there; whatever was in it is hidden while the disk is mounted.

## Good uses

| What                 | `path`                      |
| -------------------- | --------------------------- |
| Go’s build cache     | `~/.cache/go-build`         |
| Go modules           | `~/go/pkg/mod`              |
| Turborepo            | `.turbo`                    |
| Next.js build cache  | `.next/cache`               |
| Rust’s target folder | `target`                    |
| Gradle               | `~/.gradle/caches`          |
| pnpm’s store         | `~/.local/share/pnpm/store` |

Give each its own key. A job mounts up to 4 disks.

## Limits

- **4 disks per job.** A fifth `checklane/disk` step in the same job does nothing and says
  so.
- **Only trusted runs are kept.** What a job leaves on a disk is kept only when the job
  succeeded in a push, scheduled or manual run on the repository’s default branch. Other
  branches and pull requests, forks’ included, still get the disk, but their changes are
  thrown away.
- **The last job to finish wins.** When jobs with the same key run at the same time, the
  next job starts from the one that finished last.
- **$0.30 per GB a month** for what the disks hold, paid from your credit first. Disks need
  a paid plan or credit.
- **Each repository has a limit.** Past it, the disk used longest ago is removed first.
- **Not in container jobs.** A job with `container:` runs its steps in the container, where
  the disk can’t be mounted.

You see every disk a repository has, what it holds and what it costs, on the Caching page of
your Checklane dashboard.

## Off Checklane

On any other runner the step prints a warning and does nothing, so a workflow that also
runs elsewhere keeps working. If a disk can’t be mounted, the step warns and the job runs
without it. It never fails your job.

## Development

See [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
