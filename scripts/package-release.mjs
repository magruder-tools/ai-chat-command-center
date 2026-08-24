import { cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const releaseDir = resolve("release");
const unpackedDir = resolve("release/unpacked");
const manifest = JSON.parse(await readFile(resolve("dist/manifest.json"), "utf8"));
const zipPath = resolve(`release/chatgpt-command-center-v${manifest.version}.zip`);

async function removeConflictCopies(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.includes(" 2")) {
      await rm(path, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeConflictCopies(path);
    }
  }
}

await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });
await mkdir(unpackedDir, { recursive: true });
await removeConflictCopies(unpackedDir);

// Keep the live unpacked directory in place so a currently loaded Chrome
// extension never loses its files while a new release is being prepared.
await cp(resolve("dist"), unpackedDir, { recursive: true, force: true });

// Build the distributable ZIP from a clean staging directory so preserved
// live assets from an older version never leak into the archive.
const stagingDir = await mkdtemp(join(tmpdir(), "chatgpt-command-center-release-"));
try {
  await cp(resolve("dist"), stagingDir, { recursive: true });
  execFileSync("/usr/bin/zip", ["-q", "-r", zipPath, "."], { cwd: stagingDir, stdio: "inherit" });
} finally {
  await rm(stagingDir, { recursive: true, force: true });
}

console.log(`Unpacked extension: ${unpackedDir}`);
console.log(`Release ZIP: ${zipPath}`);
