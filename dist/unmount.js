// Unmounts the disk the main step mounted, so the machine's host can keep it.
// The machine also unmounts every disk when the job ends.
import { ask, endpoint, out, reason, warning } from "./lib.js";
export async function unmount(env) {
    const key = env.STATE_key;
    const disks = endpoint(env);
    if (!key || !disks) {
        return;
    }
    let answer;
    try {
        answer = await ask(disks, "/unmount", { key });
    }
    catch (error) {
        warning(`Disk ${key} isn’t unmounted yet; it will be when the job ends: ${reason(error)}`);
        return;
    }
    if (!answer.unmounted) {
        warning(`Disk ${key} isn’t unmounted yet; it will be when the job ends: ${answer.skipped || "no reason given"}`);
        return;
    }
    out.write(`Disk ${key} unmounted\n`);
}
