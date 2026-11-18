import { NextResponse } from "next/server";
import { createChallenge } from "@/lib/antibot";

export const dynamic = "force-dynamic";

// Veřejná výzva pro proof-of-work (ALTCHA). Je bezstavová a levná, každá je platná 10 minut a jde použít jednou.
export async function GET() {
  return NextResponse.json(await createChallenge(), { headers: { "Cache-Control": "no-store" } });
}
