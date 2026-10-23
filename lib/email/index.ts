// E-maily: veřejné rozhraní pro server. Události a šablony: events.ts, nastavení: settings.ts.
export { sendEventEmail, type EmailRecipient, type SendSummary, type SendOptions } from "@/lib/email/send";
export { isValidEmail, getEmailStatus, type EmailStatus } from "@/lib/email/transport";
export { appUrl } from "@/lib/email/url";
