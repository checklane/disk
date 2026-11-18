import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";

import { out, resolve } from "../src/lib.ts";
import type { Env } from "../src/lib.ts";
import { mount } from "../src/mount.ts";
import { unmount } from "../src/unmount.ts";

type Asked = { route: string; body: unknown };

// machine is a disk endpoint answering each route with what it is given,
// recording what it was asked.
async function machine(t: TestContext, answers: Record<string, unknown>) {
  const asked: Asked[] = [];
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
      const route = request.url ?? "";
      asked.push({ route, body: JSON.parse(body) });
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(answers[route]));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());

  return { asked, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

// output captures what the step writes.
function output(t: TestContext): string[] {
  const lines: string[] = [];
  const write = out.write;
  out.write = (line) => {
    lines.push(line);
  };
  t.after(() => {
    out.write = write;
  });

  return lines;
}

// job is the env of a step, with a state file of its own.
function job(t: TestContext, extra: Env): Env & { GITHUB_STATE: string } {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "checklane-disk-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const state = path.join(folder, "state");
  fs.writeFileSync(state, "");

  return {
    HOME: "/home/runner",
    GITHUB_WORKSPACE: "/home/runner/work/app/app",
    GITHUB_STATE: state,
    ...extra,
  };
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
  await mount(env);
  assert.match(lines.join(""), /^::warning::checklane\/disk does nothing here/);
  assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), "");
});

test("on a Checklane machine without disks, says so", async (t) => {
  const lines = output(t);
  const env = job(t, {
    INPUT_KEY: "go-build",
    INPUT_PATH: "~/.cache/go-build",
    RUNNER_NAME: "checklane-131079136857",
  });
  await mount(env);
  assert.match(
    lines.join(""),
    /^::warning::Disk go-build isn’t mounted, so the job runs without it: this Checklane machine doesn’t offer disks/,
  );
  assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), "");
});

test("warns without a key or a path", async (t) => {
  const lines = output(t);
  await mount(job(t, { INPUT_KEY: "go-build" }));
  assert.match(lines.join(""), /^::warning::checklane\/disk needs both key and path/);
});

test("mounts the disk and unmounts it after the job", async (t) => {
  const disks = await machine(t, {
    "/mount": { mounted: true, restored: true },
    "/unmount": { unmounted: true },
  });
  const lines = output(t);
  const env = job(t, {
    INPUT_KEY: "go-build",
    INPUT_PATH: "~/.cache/go-build",
    CHECKLANE_DISK_URL: disks.url,
    CHECKLANE_DISK_TOKEN: "token",
  });

  await mount(env);
  assert.deepEqual(disks.asked[0], {
    route: "/mount",
    body: {
      key: "go-build",
      path: "/home/runner/.cache/go-build",
      paths: ["/home/runner/.cache/go-build"],
      commit: "true",
    },
  });
  assert.match(
    lines.join(""),
    /::notice::Disk go-build mounted at \/home\/runner\/.cache\/go-build, with what the last run left/,
  );
  assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), `key=go-build${os.EOL}`);

  await unmount({ ...env, STATE_key: "go-build" });
  assert.deepEqual(disks.asked[1], { route: "/unmount", body: { key: "go-build" } });
  assert.match(lines.join(""), /Disk go-build unmounted\n$/);
});

test("mounts one disk at each of its paths", async (t) => {
  const disks = await machine(t, {
    "/mount": {
      mounted: true,
      restored: false,
      paths: ["/home/runner/.cache/go-build", "/home/runner/go/pkg/mod"],
    },
  });
  const lines = output(t);
  const env = job(t, {
    INPUT_KEY: "go",
    INPUT_PATH: "~/.cache/go-build\n\n  ~/go/pkg/mod  \n~/.cache/go-build\n",
    CHECKLANE_DISK_URL: disks.url,
    CHECKLANE_DISK_TOKEN: "token",
  });

  await mount(env);
  assert.deepEqual(disks.asked[0], {
    route: "/mount",
    body: {
      key: "go",
      path: "/home/runner/.cache/go-build",
      paths: ["/home/runner/.cache/go-build", "/home/runner/go/pkg/mod"],
      commit: "true",
    },
  });
  assert.equal(
    lines.join(""),
    "::notice::Disk go mounted at /home/runner/.cache/go-build, /home/runner/go/pkg/mod, empty\n",
  );
  assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), `key=go${os.EOL}`);
});

test("a machine that mounts a disk at one path says which paths go without", async (t) => {
  const disks = await machine(t, { "/mount": { mounted: true, restored: true } });
  const lines = output(t);
  const env = job(t, {
    INPUT_KEY: "go",
    INPUT_PATH: "~/.cache/go-build\n~/go/pkg/mod",
    CHECKLANE_DISK_URL: disks.url,
    CHECKLANE_DISK_TOKEN: "token",
  });

  await mount(env);
  assert.equal(
    lines.join(""),
    "::notice::Disk go mounted at /home/runner/.cache/go-build, with what the last run left\n" +
      "::warning::Disk go isn’t mounted at /home/runner/go/pkg/mod, so the job runs without it there: this Checklane machine mounts a disk at one path only\n",
  );
  assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), `key=go${os.EOL}`);
});

test("sends the commit input and says when the machine doesn’t read it", async (t) => {
  for (const [answered, warns] of [
    [{ mounted: true, restored: true, paths: ["/home/runner/tools"], commit: "false" }, false],
    [{ mounted: true, restored: true, paths: ["/home/runner/tools"] }, true],
  ] as const) {
    const disks = await machine(t, { "/mount": answered });
    const lines = output(t);
    await mount(
      job(t, {
        INPUT_KEY: "tools",
        INPUT_PATH: "~/tools",
        INPUT_COMMIT: "false",
        CHECKLANE_DISK_URL: disks.url,
        CHECKLANE_DISK_TOKEN: "token",
      }),
    );
    assert.equal((disks.asked[0]?.body as { commit?: string } | undefined)?.commit, "false");
    assert.equal(
      lines
        .join("")
        .includes("::warning::Disk tools is kept after a trusted run whatever commit says"),
      warns,
    );
  }
});

test("warns about a commit it doesn’t know and asks for no disk", async (t) => {
  const disks = await machine(t, {});
  const lines = output(t);
  await mount(
    job(t, {
      INPUT_KEY: "tools",
      INPUT_PATH: "~/tools",
      INPUT_COMMIT: "sometimes",
      CHECKLANE_DISK_URL: disks.url,
      CHECKLANE_DISK_TOKEN: "token",
    }),
  );
  assert.match(
    lines.join(""),
    /^::warning::checklane\/disk’s commit is true, false, on-change or if-missing, not sometimes/,
  );
  assert.equal(disks.asked.length, 0);
});

test("a disk not mounted warns and leaves the job be", async (t) => {
  const disks = await machine(t, {
    "/mount": { mounted: false, restored: false, skipped: "a job mounts at most 4 disks" },
  });
  const lines = output(t);
  const env = job(t, {
    INPUT_KEY: "fifth",
    INPUT_PATH: "fifth",
    CHECKLANE_DISK_URL: disks.url,
    CHECKLANE_DISK_TOKEN: "token",
  });

  await mount(env);
  assert.match(
    lines.join(""),
    /::warning::Disk fifth isn’t mounted, so the job runs without it: a job mounts at most 4 disks/,
  );
  assert.equal(fs.readFileSync(env.GITHUB_STATE, "utf8"), "");

  await unmount({ ...env, STATE_key: "" });
  assert.equal(disks.asked.length, 1);
});

test("a machine that does not answer warns and leaves the job be", async (t) => {
  const lines = output(t);
  const env = job(t, {
    INPUT_KEY: "go-build",
    INPUT_PATH: "/x",
    CHECKLANE_DISK_URL: "http://127.0.0.1:1",
    CHECKLANE_DISK_TOKEN: "token",
  });

  await mount(env);
  assert.match(lines.join(""), /::warning::Disk go-build isn’t mounted/);
  assert.equal(process.exitCode ?? 0, 0);
});
