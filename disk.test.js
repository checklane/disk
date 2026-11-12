"use strict";

// node --test

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { out, resolve } = require("./lib.js");
const { main } = require("./main.js");
const { post } = require("./post.js");

// machine is a disk endpoint answering mount and unmount with what it is
// given, recording what it was asked.
async function machine(t, answers) {
    const asked = [];
    const server = http.createServer((request, response) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
        });
        request.on("end", () => {
            if (request.headers.authorization !== "Bearer token") {
                response.writeHead(401).end("the token is not this machine's");
                return;
            }
            asked.push({ route: request.url, body: JSON.parse(body) });
            response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answers[request.url]));
        });
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    t.after(() => server.close());

    return { asked, url: `http://127.0.0.1:${server.address().port}` };
}

// output captures what the step writes.
function output(t) {
    const lines = [];
    const write = out.write;
    out.write = (line) => lines.push(line);
    t.after(() => {
        out.write = write;
    });

    return lines;
}

function job(t, extra) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "checklane-disk-"));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const state = path.join(folder, "state");
    fs.writeFileSync(state, "");

    return { HOME: "/home/runner", GITHUB_WORKSPACE: "/home/runner/work/app/app", GITHUB_STATE: state, ...extra };
}

test("resolves the path as the step gives it", () => {
    const env = { HOME: "/home/runner", GITHUB_WORKSPACE: "/home/runner/work/app/app" };
    assert.equal(resolve(env, "~"), "/home/runner");
    assert.equal(resolve(env, "~/.cache/go-build"), "/home/runner/.cache/go-build");
    assert.equal(resolve(env, "node_modules"), "/home/runner/work/app/app/node_modules");
    assert.equal(resolve(env, "/var/cache/x"), "/var/cache/x");
});

test("does nothing but warn off Checklane", async (t) => {
    const lines = output(t);
    const env = job(t, { INPUT_KEY: "go-build", INPUT_PATH: "~/.cache/go-build" });
    await main(env);
    assert.match(lines.join(""), /^::warning::checklane\/disk does nothing here/);
    assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), "");
});

test("mounts the disk and unmounts it after the job", async (t) => {
    const disks = await machine(t, { "/mount": { mounted: true, restored: true, skipped: "" }, "/unmount": { unmounted: true } });
    const lines = output(t);
    const env = job(t, { INPUT_KEY: "go-build", INPUT_PATH: "~/.cache/go-build", CHECKLANE_DISK_URL: disks.url, CHECKLANE_DISK_TOKEN: "token" });

    await main(env);
    assert.deepEqual(disks.asked[0], { route: "/mount", body: { key: "go-build", path: "/home/runner/.cache/go-build" } });
    assert.match(lines.join(""), /::notice::Disk go-build mounted at \/home\/runner\/.cache\/go-build, with what the last run left/);
    assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), `key=go-build${os.EOL}`);

    await post({ ...env, STATE_key: "go-build" });
    assert.deepEqual(disks.asked[1], { route: "/unmount", body: { key: "go-build" } });
});

test("a disk not mounted warns and leaves the job be", async (t) => {
    const disks = await machine(t, { "/mount": { mounted: false, restored: false, skipped: "a job mounts at most 4 disks" } });
    const lines = output(t);
    const env = job(t, { INPUT_KEY: "fifth", INPUT_PATH: "fifth", CHECKLANE_DISK_URL: disks.url, CHECKLANE_DISK_TOKEN: "token" });

    await main(env);
    assert.match(lines.join(""), /::warning::Disk fifth isn’t mounted, so the job runs without it: a job mounts at most 4 disks/);
    assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), "");

    await post({ ...env, STATE_key: "" });
    assert.equal(disks.asked.length, 1);
});

test("a machine that does not answer warns and leaves the job be", async (t) => {
    const lines = output(t);
    const env = job(t, { INPUT_KEY: "go-build", INPUT_PATH: "/x", CHECKLANE_DISK_URL: "http://127.0.0.1:1", CHECKLANE_DISK_TOKEN: "token" });

    await main(env);
    assert.match(lines.join(""), /::warning::Disk go-build isn’t mounted/);
    assert.equal(process.exitCode ?? 0, 0);
});
