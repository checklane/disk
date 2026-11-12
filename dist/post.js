// After the job's steps: action.yml runs dist/post.js.
import { unmount } from "./unmount.js";
await unmount(process.env);
