import { readFile, writeFile } from "node:fs/promises";

const edits = [
  {
    path: "convex/authHelper.ts",
    replacements: [
      [
        'import { QueryCtx, MutationCtx } from "./_generated/server";\nimport { v } from "convex/values";',
        'import { QueryCtx, MutationCtx } from "./_generated/server";\nimport type { Id } from "./_generated/dataModel";\nimport { v } from "convex/values";',
      ],
      [
        "): Promise<any> {",
        '): Promise<Id<"users">> {',
      ],
    ],
  },
  {
    path: "src/App.tsx",
    replacements: [
      [
        "(navigator.standalone === false && !ua.includes(\"safari\")",
        "((navigator as Navigator & { standalone?: boolean }).standalone === false && !ua.includes(\"safari\")",
      ],
    ],
  },
  {
    path: "src/CreateInvoiceModal.tsx",
    replacements: [
      [
        "taxRate: i.vat_rate || 0",
        "taxRate: prefillData.vat_rate || 0",
      ],
    ],
  },
  {
    path: "src/SmartInvoiceModal.tsx",
    replacements: [
      [
        "setScanResult(result);",
        "setScanResult(result as ScanResult);",
      ],
    ],
  },
];

let changed = 0;
for (const edit of edits) {
  let source = await readFile(edit.path, "utf8");
  for (const [from, to] of edit.replacements) {
    if (!source.includes(from)) {
      throw new Error(`Expected source not found in ${edit.path}: ${from}`);
    }
    source = source.replaceAll(from, to);
  }
  await writeFile(edit.path, source);
  changed += 1;
}

console.log(`Updated ${changed} files.`);
