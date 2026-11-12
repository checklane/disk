<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset=".github/assets/checklane-logo-paper.svg">
    <img src=".github/assets/checklane-logo-ink.svg" alt="Checklane" width="280">
  </picture>
  disk
</h1>

Keep a directory between your jobs on [Checklane](https://checklane.sh), mounted in place.

## Quick start

Put the disk step before the step that fills the directory. The next job in your
repository that uses the same key starts with what the last trusted run left there.

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

A new key starts with an empty disk. Your build fills it as usual.

## Why a disk instead of actions/cache?

With `actions/cache`, your job downloads and unpacks a saved cache, then uploads a cache
when it needs to save one. With a disk, the directory is just there, mounted at the path
your tools already use. There is nothing to download, upload or unpack. Even a big
cache has no transfer or unpacking cost when your job restores it.

Disk storage is billed separately. See [Limits](#limits) for pricing and retention.

## How it works

1. The action's main step asks the Checklane machine for your repository's disk named
   by `key`.
2. The machine mounts the disk at `path`. Your later steps read and write that directory
   as usual.
3. After your job's steps, the action's post step asks the machine to unmount the disk.
   The machine also unmounts every disk when the job ends.
4. If the run is trusted and the job succeeded, Checklane keeps what the disk holds for
   the next job in the repository that uses the same key.

A **trusted run** is a push, scheduled or manual run on the repository's default branch.
Other branches and pull requests can use the disk, but their changes are thrown away.

## Inputs

Both inputs are required.

- **`key`**: Names the disk within your repository. Up to 128 characters, on one line.
  Jobs that use the same key get the same disk.
- **`path`**: The directory where the disk is mounted. Use an absolute path, `~` for
  the runner's home, or a path relative to the workspace.

The directory is created if it does not exist. **Anything already at `path` is hidden
while the disk is mounted.** Mount the disk before installing dependencies or building.

## Good uses

Use disks for dependencies and build caches your tools can rebuild. Give each directory
its own key. You can mount up to **4 disks in one job**.

These snippets go under `steps:` in a job running on Checklane, after checkout and any
steps that set up your tools. Use the snippets that fit your project.

### Go build cache and modules

Mount both directories before running Go. This uses two disks in the same job.

```yaml
- uses: checklane/disk@v1
  with:
    key: go-build
    path: ~/.cache/go-build
- uses: checklane/disk@v1
  with:
    key: go-modules
    path: ~/go/pkg/mod
- run: go build ./...
```

### Turborepo

Keep the local build cache between jobs. This example uses pnpm to run Turbo.

```yaml
- uses: checklane/disk@v1
  with:
    key: turbo
    path: .turbo
- run: pnpm install --frozen-lockfile
- run: pnpm exec turbo run build
```

### Next.js

Mount the build cache before building your app. For an app in a subdirectory, adjust
`path` to point to that app's `.next/cache` directory.

```yaml
- uses: checklane/disk@v1
  with:
    key: next-build
    path: .next/cache
- run: pnpm install --frozen-lockfile
- run: pnpm exec next build
```

### Rust target directory

Keep compiled build outputs in `target`.

```yaml
- uses: checklane/disk@v1
  with:
    key: rust-target
    path: target
- run: cargo build --locked
```

### Gradle

Keep Gradle's caches between jobs. The build command below also enables Gradle's build
cache.

```yaml
- uses: checklane/disk@v1
  with:
    key: gradle
    path: ~/.gradle/caches
- run: ./gradlew build --build-cache
```

### pnpm store

Point pnpm at the mounted store when installing dependencies.

```yaml
- uses: checklane/disk@v1
  with:
    key: pnpm-store
    path: ~/.local/share/pnpm/store
- run: pnpm install --frozen-lockfile --store-dir ~/.local/share/pnpm/store
```

## Limits

- **4 disks per job.** A fifth `checklane/disk` step in the same job does nothing and
  says so.
- **Only trusted runs are kept.** The job must succeed in a push, scheduled or manual
  run on the repository's default branch. Other branches and pull requests, including
  those from forks, still get the disk, but their changes are thrown away.
- **The last job to finish wins.** When jobs with the same key run at the same time,
  the next job starts from the one that finished last.
- **$0.30 per GB a month** for what the disks hold, paid from your credit first. Disks
  need a paid plan or credit.
- **Each repository has a limit.** When it is exceeded, the longest-unused disk is
  removed first.
- **Not in container jobs.** A job with `container:` runs its steps in the container,
  where the disk cannot be mounted.

## See your disks

Open the **Caching** page of your Checklane dashboard to see every disk a repository
has, what it holds and what it costs.

## Off Checklane

On other runners, the action prints a warning and does nothing. Your workflow keeps
running without the disk.

If a disk cannot be mounted on Checklane, the action also warns and your job runs
without it. If unmounting fails, it warns and the machine unmounts the disk at the end
of the job. **The action never fails your job.**

## FAQ

### What happens on pull requests, including forks?

Pull request jobs get the disk, including jobs for pull requests from forks. Their
changes are thrown away, so they do not replace the disk kept for later jobs. Jobs on
other branches behave the same way.

### What if two jobs use the same key at once?

The last job to finish wins. Among jobs whose changes are kept, the next job starts
with what the last finisher left. Changes from pull requests and other untrusted runs
are still thrown away.

### What if my build fails?

Its disk changes are not kept. Only successful jobs in trusted runs update the disk
for later jobs.

### How do I start fresh?

Use a new key, such as `go-build-v2`. A new key starts with an empty disk.

### Do I need a separate save step?

No. Your tools write directly to the mounted directory. The action's post step handles
unmounting, and Checklane keeps the disk when the run qualifies.

## Development

See [AGENTS.md](AGENTS.md) for how the action works, local commands and contribution
rules.

## License

[MIT](LICENSE)
