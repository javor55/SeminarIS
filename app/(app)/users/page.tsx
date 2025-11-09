import { getCurrentUser, getAllUsers } from "@/lib/data";

export default function UsersPage() {
  const currentUser = getCurrentUser();
  if (currentUser.role !== "ADMIN") {
    return <p>Pouze pro administrátory.</p>;
  }
  const users = getAllUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Uživatelé</h1>
      <div className="bg-white border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Jméno</th>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Stav</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.firstName} {u.lastName}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.role}</td>
                <td className="p-2">{u.isActive ? "Aktivní" : "Neaktivní"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
