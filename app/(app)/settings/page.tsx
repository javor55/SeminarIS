import { getCurrentUser } from "@/lib/data";

export default function SettingsPage() {
  const user = getCurrentUser();
  if (user.role !== "ADMIN") {
    return <p>Pouze pro administrátory.</p>;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nastavení</h1>
      <div className="bg-white border rounded-md p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Název školy</label>
          <input className="border rounded-md px-2 py-1 w-full" defaultValue="Moje škola" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Popis uvítací stránky</label>
          <textarea className="border rounded-md px-2 py-1 w-full" rows={3} defaultValue="Popis systému zápisů" />
        </div>
        <button className="px-4 py-2 bg-slate-900 text-white rounded-md">Uložit</button>
      </div>
    </div>
  );
}
