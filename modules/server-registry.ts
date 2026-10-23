import type { ModuleId } from "@/modules/registry";
import type { ModuleServer } from "@/modules/server-types";
import { coreServer } from "@/modules/core/server";
import { seminarsServer } from "@/modules/seminars/server";
import { makeupServer } from "@/modules/makeup/server";

// Serverové části modulů (jen pro server – importují DB a komponenty).
// Pořadí určuje pořadí widgetů na dashboardu a statistik v administraci.
export const MODULE_SERVERS: ReadonlyArray<{ id: ModuleId; server: ModuleServer }> = [
  { id: "core", server: coreServer },
  { id: "seminars", server: seminarsServer },
  { id: "makeup", server: makeupServer },
];
