import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { describeSettings } from "@/lib/settings-registry";
import { isMicrosoftConfigured } from "@/lib/auth-settings";
import { SettingsForm } from "@/modules/core/components/admin/SettingsForm";

const REGISTRATION_KEYS = ["registration_enabled", "default_user_role", "registration_class_mode"];
const AUTH_KEYS = ["auth.microsoft.enabled", "auth.microsoft.autoCreate", "auth.password.scope"];

export default async function RegistrationSettingsPage() {
  const user = await requirePagePermission("core.admin");
  const [registration, auth] = await Promise.all([
    describeSettings(user, (d) => REGISTRATION_KEYS.includes(d.key)),
    describeSettings(user, (d) => AUTH_KEYS.includes(d.key)),
  ]);
  const microsoftConfigured = isMicrosoftConfigured();

  return (
    <div className="space-y-6">
      <PageHeader title="Registrace a přihlášení" description="Kdo a jak se může do systému dostat." />
      <SettingsForm
        title="Registrace"
        description="Základní parametry registrace nových uživatelů."
        fields={registration}
        testId="registration-card"
      />
      <SettingsForm
        title="Přihlášení"
        description="Microsoft 365 a klasické heslo mohou fungovat současně; účty se párují podle e-mailu."
        fields={auth}
        disabledKeys={microsoftConfigured ? [] : AUTH_KEYS}
        testId="auth-card"
        notice={
          !microsoftConfigured && (
            <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              Microsoft 365 není nakonfigurováno. Je potřeba registrace aplikace v Microsoft Entra ID a proměnné
              prostředí <code>AZURE_AD_TENANT_ID</code>, <code>AZURE_AD_CLIENT_ID</code> a <code>AZURE_AD_CLIENT_SECRET</code> na
              Vercelu. Do té doby se všichni přihlašují heslem.
            </p>
          )
        }
      />
    </div>
  );
}
