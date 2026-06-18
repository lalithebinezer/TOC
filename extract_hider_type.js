import fs from "fs";

// Accept a custom file path (default to the original) and an optional '--trim' flag.
const file = process.argv[2] ?? "node_modules/@thatopen/components/dist/index.d.ts";
const trim = process.argv.includes("--trim");

try {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  let found = false;
  let braces = 0;
  const extracted = [];
  for (let i = 0; i < lines.length; i++) {
    if (!found && lines[i].includes("class Hider")) {
      found = true;
    }
    if (found) {
      extracted.push(lines[i]);
      if (lines[i].includes("{")) braces++;
      if (lines[i].includes("}")) braces--;
      if (braces === 0 && lines[i].includes("}")) {
        break;
      }
    }
  }
  if (extracted.length === 0) {
    console.error("Class Hider not found in the file.");
    process.exit(1);
  }
  // Optionally trim line numbers and whitespace for a cleaner output.
  const output = trim
    ? extracted.map(l => l.replace(/^\s*\d+:\s*/, "")).join("\n")
    : extracted.join("\n");
  // Emit JSON so downstream tools can consume it easily.
  console.log(JSON.stringify({ classBlock: output }, null, 2));
} catch (e) {
  console.error(e);
  process.exit(1);
}
