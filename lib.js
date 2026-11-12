"use strict";

// What main.js and post.js share. No dependencies: the runner's Node has
// fetch, and the workflow commands are lines on stdout.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// requestTimeout bounds a request to the machine's disk endpoint: putting a
// disk in place takes seconds.
const requestTimeout = 5 * 60 * 1000;

// out is where the step's lines go: the job's log.
const out = {
    write(line) {
        process.stdout.write(line);
    },
};

// escape makes text safe in a workflow command.
function escape(text) {
    return String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function notice(message) {
    out.write(`::notice::${escape(message)}\n`);
}

function warning(message) {
    out.write(`::warning::${escape(message)}\n`);
}

// input reads an action input as the runner passes it.
function input(env, name) {
    return (env[`INPUT_${name.toUpperCase()}`] || "").trim();
}

// resolve makes the path absolute: ~ is the home directory, a relative path
// is relative to the workspace.
function resolve(env, given) {
    const home = env.HOME || os.homedir();
    if (given === "~") {
        return home;
    }
    if (given.startsWith("~/")) {
        return path.join(home, given.slice(2));
    }

    return path.resolve(env.GITHUB_WORKSPACE || process.cwd(), given);
}

// saveState keeps a value for post.js, which reads it as STATE_<name>.
function saveState(env, name, value) {
    if (env.GITHUB_STATE) {
        fs.appendFileSync(env.GITHUB_STATE, `${name}=${value}${os.EOL}`);
    }
}

// endpoint is the machine's disk endpoint, when the job runs on Checklane.
function endpoint(env) {
    const url = env.CHECKLANE_DISK_URL;
    const token = env.CHECKLANE_DISK_TOKEN;
    if (!url || !token) {
        return null;
    }

    return { url: url.replace(/\/+$/, ""), token };
}

// ask posts body to the endpoint and answers its JSON.
async function ask(disks, route, body) {
    const response = await fetch(disks.url + route, {
        method: "POST",
        headers: { authorization: `Bearer ${disks.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(requestTimeout),
    });
    if (!response.ok) {
        throw new Error(`the machine answered ${response.status}: ${(await response.text()).trim()}`);
    }

    return response.json();
}

module.exports = { ask, endpoint, input, notice, out, resolve, saveState, warning };
