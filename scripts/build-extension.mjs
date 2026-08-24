import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const shared = {
  bundle: true,
  sourcemap: true,
  target: "chrome116",
  minify: true,
  legalComments: "none",
  logLevel: "info"
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/background.js",
    format: "esm"
  }),
  build({
    ...shared,
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/content.js",
    format: "iife"
  })
]);

const manifestPath = "dist/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const forbiddenPermissions = ["notifications", "cookies", "webRequest", "debugger"];
const requested = [...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])];
const violations = forbiddenPermissions.filter((permission) => requested.includes(permission));
if (violations.length) throw new Error(`Forbidden manifest permissions: ${violations.join(", ")}`);
const allowedHosts = ["https://chatgpt.com/*", "https://claude.ai/*"];
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(allowedHosts)) {
  throw new Error(`Host permissions must remain limited to ${allowedHosts.join(" and ")}.`);
}

await writeFile("dist/.build-ready", `AI Chat Command Center ${manifest.version}\n`, "utf8");
