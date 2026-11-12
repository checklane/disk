"use strict";

// Mounts the repository's disk of the key at the path. Nothing here fails
// the job: without the disk, the job runs as it would without this step.

const { ask, endpoint, input, notice, resolve, saveState, warning } = require("./lib.js");

async function main(env) {
    const key = input(env, "key");
    const given = input(env, "path");
    if (!key || !given) {
        warning("checklane/disk needs both key and path; the job runs without the disk");
        return;
    }
    if (/[\r\n]/.test(key)) {
        warning("checklane/disk needs a key on one line; the job runs without the disk");
        return;
    }

    const disks = endpoint(env);
    if (!disks) {
        warning("checklane/disk does nothing here: the job isn’t running on Checklane");
        return;
    }

    const at = resolve(env, given);
    let answer;
    try {
        answer = await ask(disks, "/mount", { key, path: at });
    } catch (error) {
        warning(`Disk ${key} isn’t mounted, so the job runs without it: ${error.message}`);
        return;
    }
    if (!answer.mounted) {
        warning(`Disk ${key} isn’t mounted, so the job runs without it: ${answer.skipped || "no reason given"}`);
        return;
    }

    saveState(env, "key", key);
    notice(answer.restored ? `Disk ${key} mounted at ${at}, with what the last run left` : `Disk ${key} mounted at ${at}, empty`);
}

if (require.main === module) {
    main(process.env);
}

module.exports = { main };
