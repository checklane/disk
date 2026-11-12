"use strict";

// Unmounts the disk main.js mounted, so the machine's host can keep it.
// The machine also unmounts every disk when the job ends.

const { ask, endpoint, out, warning } = require("./lib.js");

async function post(env) {
    const key = env.STATE_key;
    const disks = endpoint(env);
    if (!key || !disks) {
        return;
    }

    try {
        const answer = await ask(disks, "/unmount", { key });
        if (!answer.unmounted) {
            warning(`Disk ${key} isn’t unmounted yet; it will be when the job ends: ${answer.skipped || "no reason given"}`);
            return;
        }
        out.write(`Disk ${key} unmounted\n`);
    } catch (error) {
        warning(`Disk ${key} isn’t unmounted yet; it will be when the job ends: ${error.message}`);
    }
}

if (require.main === module) {
    post(process.env);
}

module.exports = { post };
