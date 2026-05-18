// One-shot codemod: swap AppHeader → AppShell across all pages.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `git grep -l "AppHeader" -- "src/app/**/page.tsx"`,
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

console.log(`Migrating ${files.length} files...`);

let changed = 0;
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let out = original;

  // 1) Import swap.
  out = out.replace(
    /import\s+\{\s*AppHeader\s*\}\s+from\s+"@\/components\/shell\/app-header";/g,
    'import { AppShell } from "@/components/shell/app-shell";',
  );

  // 2) Opening pattern: `<div className="min-h-screen">\n... <AppHeader ... />`
  //    → `<AppShell ...>`
  out = out.replace(
    /<div className="min-h-screen">\s*<AppHeader([^/]*)\/>/g,
    "<AppShell$1>",
  );

  // 3) Closing pattern: `</main></div>` at the bottom of the return tree.
  //    → `</main></AppShell>`
  out = out.replace(/<\/main>(\s*)<\/div>/g, "</main>$1</AppShell>");

  if (out !== original) {
    writeFileSync(file, out);
    changed++;
    console.log(`  ✓ ${file}`);
  }
}

console.log(`\nDone — ${changed} file(s) changed.`);
