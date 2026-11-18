import type { ModuleServer } from "@/modules/server-types";
import { getEventsEmailEstimates, runEventsDailyJob } from "@/modules/events/daily";
import { getEventsAdminTodos, getEventsDashboardCards } from "@/modules/events/dashboard";
import { eventsDemoData } from "@/modules/events/demo-data";

// Serverová část modulu Události: denní úloha (připomínka, smazání osobních údajů, úklid), karta přehledu,
// úkol administrace, odhad e-mailů a ukázková data.
export const eventsServer: ModuleServer = {
  // Ukázková data pro prezentaci (Administrace → Ukázková data)
  demoData: eventsDemoData,

  runDailyJob: runEventsDailyJob,
  getEmailEstimates: () => getEventsEmailEstimates(),

  getDashboardCards: getEventsDashboardCards,
  getAdminTodos: getEventsAdminTodos,

  async onUserDelete(tx, userId, replacementUserId) {
    // Události a obrázky, které uživatel založil, převezme admin, který maže
    await tx.event.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    await tx.eventImage.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    // Spoluorganizátory, publikum a registrace přihlášených řeší databáze (onDelete: Cascade / SetNull)
  },
};
