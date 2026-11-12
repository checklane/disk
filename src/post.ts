// After the job's steps: action.yml runs dist/post.js.

import { unmount } from "./unmount.ts";

await unmount(process.env);
