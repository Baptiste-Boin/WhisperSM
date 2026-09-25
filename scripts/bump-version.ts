#!/usr/bin/env bun
/**
 * Bump the application version everywhere it is declared and (optionally)
 * create the release commit + tag that triggers the Release workflow.
 *
 *   bun run release:bump patch            # 0.9.1 -> 0.9.2
 *   bun run release:bump minor            # 0.9.1 -> 0.10.0
 *   bun run release:bump 1.2.3            # explicit version
 *   bun run release:bump patch --tag      # also commit and tag (v0.9.2)
 *
 * Then: git push --follow-tags
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bump = args.find((a) => !a.startsWith("--"));
const shouldTag = args.includes("--tag");
const dryRun = args.includes("--dry-run");

if (!bump) {
  console.error(
    "Usage: bun run release:bump <patch|minor|major|x.y.z> [--tag] [--dry-run]",
  );
  process.exit(1);
}

const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const packageJsonPath = path.join(root, "package.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
const current: string = tauriConf.version;

const nextVersion = (() => {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (!/^\d+\.\d+\.\d+$/.test(bump)) {
        console.error(`Invalid version: ${bump}`);
        process.exit(1);
      }
      return bump;
  }
})();

console.log(`${current} -> ${nextVersion}`);

const replaceVersion = (file: string, transform: (s: string) => string) => {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (before === after) {
    console.warn(`  (unchanged) ${path.relative(root, file)}`);
    return;
  }
  if (!dryRun) fs.writeFileSync(file, after);
  console.log(`  updated ${path.relative(root, file)}`);
};

replaceVersion(tauriConfPath, (s) =>
  s.replace(/"version": "[^"]+"/, `"version": "${nextVersion}"`),
);
replaceVersion(packageJsonPath, (s) =>
  s.replace(/"version": "[^"]+"/, `"version": "${nextVersion}"`),
);
replaceVersion(cargoTomlPath, (s) =>
  s.replace(/^version = "[^"]+"/m, `version = "${nextVersion}"`),
);
replaceVersion(cargoLockPath, (s) =>
  s.replace(
    /(\[\[package\]\]\nname = "whispersm"\nversion = )"[^"]+"/,
    `$1"${nextVersion}"`,
  ),
);

if (shouldTag && !dryRun) {
  const tag = `v${nextVersion}`;
  execSync(
    `git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`,
    { cwd: root, stdio: "inherit" },
  );
  execSync(`git commit -m "chore(release): ${tag}"`, {
    cwd: root,
    stdio: "inherit",
  });
  execSync(`git tag -a ${tag} -m "WhisperSM ${tag}"`, {
    cwd: root,
    stdio: "inherit",
  });
  console.log(`\nTagged ${tag}. Push with: git push --follow-tags`);
} else if (shouldTag) {
  console.log("(dry run) would commit and tag");
} else {
  console.log(
    `\nNext: git commit -am "chore(release): v${nextVersion}" && git tag v${nextVersion} && git push --follow-tags`,
  );
}
