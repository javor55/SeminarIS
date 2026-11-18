import type { ModuleServer } from "@/modules/server-types";

// Serverová část modulu Události. Body rozšíření (karty dashboardu, denní úloha, ukázková data…)
// přibývají v dalších ticketech.
export const eventsServer: ModuleServer = {
  async onUserDelete(tx, userId, replacementUserId) {
    // Události a obrázky, které uživatel založil, převezme admin, který maže
    await tx.event.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    await tx.eventImage.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    // Spoluorganizátory, publikum a registrace přihlášených řeší databáze (onDelete: Cascade / SetNull)
  },
};
