import { readFile, writeFile } from "node:fs/promises";

async function replace(path, from, to) {
  const source = await readFile(path, "utf8");
  if (!source.includes(from)) throw new Error(`Expected source not found in ${path}`);
  await writeFile(path, source.replace(from, to));
}

await replace(
  "convex/recurringOrders.ts",
  `} from "../shared/recurrence";`,
  `} from "../shared/recurrence";\nimport { canUseRecurringOrders, recurringPlanError } from "../shared/planAccess";`,
);

await replace(
  "convex/recurringOrders.ts",
  `    if (user.plan === "free") {\n      throw new Error("Wiederkehrende Aufträge sind im Starter- und Pro-Plan verfügbar");\n    }`,
  `    if (!canUseRecurringOrders(user)) {\n      throw new Error(recurringPlanError(user));\n    }`,
);

await replace(
  "convex/recurringOrders.ts",
  `    await insertAudit(\n      ctx,\n      userId,\n      "recurring_order_created",\n      \`${args.title.trim()} — \${schedule.frequency} ab \${schedule.startDate}\`,\n    );\n    return templateId;`,
  `    await insertAudit(\n      ctx,\n      userId,\n      "recurring_order_created",\n      \`${args.title.trim()} — \${schedule.frequency} ab \${schedule.startDate}\`,\n    );\n    if (schedule.startDate === today) {\n      await ctx.scheduler.runAfter(0, internal.recurringOrders.generateOccurrenceJob, {\n        templateId,\n        expectedDate: schedule.startDate,\n      });\n    }\n    return templateId;`,
);

await replace(
  "convex/recurringOrders.ts",
  `    await insertAudit(\n      ctx,\n      userId,\n      "recurring_order_resumed",\n      \`${template.title} — nächster Termin \${next.date}\`,\n    );\n    return null;`,
  `    await insertAudit(\n      ctx,\n      userId,\n      "recurring_order_resumed",\n      \`${template.title} — nächster Termin \${next.date}\`,\n    );\n    if (next.date <= today) {\n      await ctx.scheduler.runAfter(0, internal.recurringOrders.generateOccurrenceJob, {\n        templateId: template._id,\n        expectedDate: next.date,\n      });\n    }\n    return null;`,
);

await replace(
  "convex/recurringOrders.ts",
  `    if (!user || user.plan === "free") {\n      throw new Error("Wiederkehrende Aufträge benötigen einen aktiven Starter- oder Pro-Plan");\n    }`,
  `    if (!user) throw new Error("Benutzer nicht gefunden");\n    if (!canUseRecurringOrders(user)) {\n      throw new Error(recurringPlanError(user));\n    }`,
);

console.log("Recurring plan and scheduler fixes applied.");
