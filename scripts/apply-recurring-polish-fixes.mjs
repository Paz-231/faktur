import { readFile, writeFile } from "node:fs/promises";

async function replace(path, from, to) {
  const source = await readFile(path, "utf8");
  if (!source.includes(from)) throw new Error(`Expected source not found in ${path}`);
  await writeFile(path, source.replace(from, to));
}

await replace(
  "src/AuftragDetail.tsx",
  `  onRefresh: () => void;\n}`,
  `  onRefresh: () => void;\n  onOpenRecurring?: (templateId: string) => void;\n}`,
);

await replace(
  "src/AuftragDetail.tsx",
  `export function AuftragDetail({ auftragId, userId, sessionToken, onClose, onRefresh }: AuftragDetailProps) {`,
  `export function AuftragDetail({ auftragId, userId, sessionToken, onClose, onRefresh, onOpenRecurring }: AuftragDetailProps) {`,
);

await replace(
  "src/AuftragDetail.tsx",
  `            <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>\n              Auftrag · {auftrag.date} · {statusBadge(auftrag.status)}\n            </div>`,
  `            <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>\n              Auftrag · {auftrag.date} · {statusBadge(auftrag.status)}\n            </div>\n            {auftrag.createdAutomatically && (\n              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>\n                <span className="badge badge-accent">Automatisch aus Serie</span>\n                {auftrag.scheduledFor && (\n                  <span style={{ fontSize: "0.6875rem", color: "var(--fg-3)" }}>Termin {auftrag.scheduledFor.split("-").reverse().join(".")}</span>\n                )}\n                {auftrag.recurringTemplateId && onOpenRecurring && (\n                  <button\n                    type="button"\n                    className="btn btn-sm btn-ghost"\n                    onClick={() => onOpenRecurring(String(auftrag.recurringTemplateId))}\n                    style={{ padding: "0.25rem 0.5rem" }}\n                  >\n                    Zur Serie\n                  </button>\n                )}\n              </div>\n            )}`,
);

await replace(
  "src/RecurringOrdersList.tsx",
  `import { useEffect, useState } from "react";`,
  `import { Fragment, useEffect, useState } from "react";`,
);

await replace(
  "src/RecurringOrdersList.tsx",
  `                {visibleTemplates.map((template: any) => (\n                  <>`,
  `                {visibleTemplates.map((template: any) => (\n                  <Fragment key={template._id}>`,
);

await replace(
  "src/RecurringOrdersList.tsx",
  `                  </>\n                ))}`,
  `                  </Fragment>\n                ))}`,
);

console.log("Recurring polish fixes applied.");
