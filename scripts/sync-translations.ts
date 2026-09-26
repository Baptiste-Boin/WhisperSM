/**
 * Keep every locale in sync with the English reference:
 * - keys missing in a locale are copied from English (so the UI never shows
 *   a raw key while a translation is pending),
 * - keys that no longer exist in English are removed.
 *
 * Usage: bun scripts/sync-translations.ts [--check]
 * With --check, exits 1 when a locale would change (no files are written).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "src", "i18n", "locales");
const REFERENCE = "en";

type Tree = Record<string, unknown>;

const isObject = (value: unknown): value is Tree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rebuild `target` following the key order and structure of `reference`. */
function sync(
  reference: Tree,
  target: Tree,
): { result: Tree; changed: boolean } {
  const result: Tree = {};
  let changed = false;
  for (const key of Object.keys(reference)) {
    const refValue = reference[key];
    const current = target[key];
    if (isObject(refValue)) {
      const nested = sync(refValue, isObject(current) ? current : {});
      result[key] = nested.result;
      if (nested.changed || !isObject(current)) changed = true;
    } else if (current === undefined || isObject(current)) {
      result[key] = refValue;
      changed = true;
    } else {
      result[key] = current;
    }
  }
  if (Object.keys(target).some((key) => !(key in reference))) changed = true;
  return { result, changed };
}

const check = process.argv.includes("--check");
const reference = JSON.parse(
  fs.readFileSync(
    path.join(LOCALES_DIR, REFERENCE, "translation.json"),
    "utf8",
  ),
) as Tree;

let anyChanged = false;
for (const entry of fs.readdirSync(LOCALES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === REFERENCE) continue;
  const file = path.join(LOCALES_DIR, entry.name, "translation.json");
  const current = JSON.parse(fs.readFileSync(file, "utf8")) as Tree;
  const { result, changed } = sync(reference, current);
  if (!changed) continue;
  anyChanged = true;
  if (check) {
    console.log(`${entry.name}: out of sync`);
  } else {
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
    console.log(`${entry.name}: updated`);
  }
}

if (check && anyChanged) process.exit(1);
if (!anyChanged) console.log("All locales are in sync.");
