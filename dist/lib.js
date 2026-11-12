// What the main and post steps share. No dependencies: the runner's Node has
// fetch, and workflow commands are lines on stdout.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// requestTimeout bounds a request to the disk endpoint: putting a disk in
// place takes seconds.
const requestTimeout = 5 * 60 * 1000;
/** Where the step's lines go: the job's log. Tests replace write. */
export const out = {
    write(line) {
        process.stdout.write(line);
    },
};
// escape makes text safe in a workflow command.
function escape(text) {
    return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
export function notice(message) {
    out.write(`::notice::${escape(message)}\n`);
}
export function warning(message) {
    out.write(`::warning::${escape(message)}\n`);
}
/** Reads an action input as the runner passes it. */
export function input(env, name) {
    return (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}
/** Makes the path absolute: ~ is the home directory, a relative path is relative to the workspace. */
export function resolve(env, given) {
    const home = env.HOME || os.homedir();
    if (given === "~") {
        return home;
    }
    if (given.startsWith("~/")) {
        return path.join(home, given.slice(2));
    }
    return path.resolve(env.GITHUB_WORKSPACE || process.cwd(), given);
}
/** Keeps a value for the post step, which reads it as STATE_<name>. */
export function saveState(env, name, value) {
    if (env.GITHUB_STATE) {
        fs.appendFileSync(env.GITHUB_STATE, `${name}=${value}${os.EOL}`);
    }
}
/** The machine's disk endpoint, or null when the job isn't on Checklane. */
export function endpoint(env) {
    const url = env.CHECKLANE_DISK_URL;
    const token = env.CHECKLANE_DISK_TOKEN;
    if (!url || !token) {
        return null;
    }
    return { url: url.replace(/\/+$/, ""), token };
}
/** Posts body to a route of the endpoint and answers its JSON. */
export async function ask(disks, route, body) {
    const response = await fetch(disks.url + route, {
        method: "POST",
        headers: { authorization: `Bearer ${disks.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(requestTimeout),
    });
    if (!response.ok) {
        throw new Error(`the machine answered ${response.status}: ${(await response.text()).trim()}`);
    }
    return (await response.json());
}
/** The message of whatever was thrown. */
export function reason(error) {
    return error instanceof Error ? error.message : String(error);
}
