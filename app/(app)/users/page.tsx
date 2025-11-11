"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { getAllUsers } from "@/lib/data";
import { UsersDataTable } from "@/components/users/usersDataTable";

export default function UsersPage() {
  const { user } = useAuth();
  const users = getAllUsers();

  if (!user) {
    return <p className="text-sm text-muted-foreground">Načítám…</p>;
  }

  if (user.role !== "ADMIN") {
    return <p className="text-sm text-muted-foreground">Pouze pro administrátory.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Uživatelé</h1>
        <p className="text-sm text-muted-foreground">
          Správa uživatelů systému.
        </p>
      </div>
      <UsersDataTable data={users as any} />
    </div>
  );
}
