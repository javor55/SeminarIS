// app/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/session";
import { getStudentNav } from "@/modules/core/student-nav";

// Úvod: nepřihlášený uživatel vidí nabídku přihlášení. Přihlášeného student pošle na zápis (má-li co dokončit),
// jinak na dopisování, jinak na prázdný stav (F12); ostatní role na dashboard.
export default async function PublicHomePage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.role === "STUDENT") redirect((await getStudentNav(user)).home);
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-3xl text-center py-20">
      <h1 className="text-4xl font-bold mb-2">{APP_NAME}</h1>
      <p className="text-muted-foreground mb-8">{APP_DESCRIPTION}</p>
      <div className="flex justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/login">Přihlásit se</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/register">Vytvořit účet</Link>
        </Button>
      </div>
      <div className="mt-12 text-sm text-muted-foreground">
        <p>
          Po přihlášení uvidíte své zápisy, termíny a další agendu.
        </p>
      </div>
    </div>
  );
}
