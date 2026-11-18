// Mounts the repository's disk of the key at each of its paths. Nothing here
// fails the job: without the disk, the job runs as it would without this
// step.

import {
  ask,
  endpoint,
  input,
  lines,
  notice,
  onChecklane,
  reason,
  resolve,
  saveState,
  warning,
} from "./lib.ts";
import type { Env, MountAnswer } from "./lib.ts";

export async function mount(env: Env): Promise<void> {
  const key = input(env, "key");
  const given = lines(env, "path");
  if (!key || given.length === 0) {
    warning("checklane/disk needs both key and path; the job runs without the disk");
    return;
  }
  if (/[\r\n]/.test(key)) {
    warning("checklane/disk needs a key on one line; the job runs without the disk");
    return;
  }

  const disks = endpoint(env);
  if (!disks) {
    warning(
      onChecklane(env)
        ? `Disk ${key} isn’t mounted, so the job runs without it: this Checklane machine doesn’t offer disks`
        : "checklane/disk does nothing here: the job isn’t running on Checklane",
    );
    return;
  }

  // A machine from before several paths reads path alone.
  const at = [...new Set(given.map((one) => resolve(env, one)))];
  let answer: MountAnswer;
  try {
    answer = await ask<MountAnswer>(disks, "/mount", { key, path: at[0], paths: at });
  } catch (error) {
    warning(`Disk ${key} isn’t mounted, so the job runs without it: ${reason(error)}`);
    return;
  }
  if (!answer.mounted) {
    warning(
      `Disk ${key} isn’t mounted, so the job runs without it: ${answer.skipped || "no reason given"}`,
    );
    return;
  }

  saveState(env, "key", key);
  const mounted = answer.paths ?? [at[0]];
  notice(
    answer.restored
      ? `Disk ${key} mounted at ${mounted.join(", ")}, with what the last run left`
      : `Disk ${key} mounted at ${mounted.join(", ")}, empty`,
  );
  const left = at.filter((one) => !mounted.includes(one));
  if (left.length > 0) {
    warning(
      `Disk ${key} isn’t mounted at ${left.join(", ")}, so the job runs without it there: this Checklane machine mounts a disk at one path only`,
    );
  }
}
