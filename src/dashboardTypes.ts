// Gemeinsame Typen der Dashboard-Seiten

export interface DashboardAuth {
  userId: string;
  email: string;
  name: string;
  plan: string;
  sessionToken: string;
}

export type Page = "dashboard" | "analytics" | "invoices" | "incoming" | "customers" | "reports" | "settings";
