import { getAuthSettings, isMicrosoftActive } from "@/lib/auth-settings";
import { LoginForm } from "./LoginForm";

// Nastavení přihlašování se čte z DB při každém zobrazení
export const dynamic = "force-dynamic";

const PASSWORD_NOTES = {
  ALL: null,
  STAFF: "Přihlášení heslem je určeno pro učitele a administrátory.",
  ADMIN: "Přihlášení heslem je určeno jen pro administrátory.",
} as const;

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const settings = await getAuthSettings();
  const microsoftEnabled = isMicrosoftActive(settings);
  return (
    <LoginForm
      microsoftEnabled={microsoftEnabled}
      passwordNote={microsoftEnabled ? PASSWORD_NOTES[settings.passwordScope] : null}
      errorCode={searchParams.error ?? null}
    />
  );
}
