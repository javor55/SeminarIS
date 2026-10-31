"use client";

import { unwrap } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { approveAsTeacher, approveUser, approveUsers, rejectUser } from "@/modules/core/actions/approvals";
import type { ClassOption } from "@/modules/core/actions/classes";
import { formatDateTime } from "@/lib/datetime";
import type { UserListRow as UserRow } from "@/modules/core/users-query";
import { Checkbox } from "@/components/ui/checkbox";
import { formatName } from "@/lib/names";

/** Hosté čekající na schválení (aktivní účty s rolí GUEST). */
export function pendingApprovals(users: UserRow[]) {
  return users
    .filter((u) => u.role === "GUEST" && u.isActive !== false)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Záložka Ke schválení: schválení hosta jedním klikem do vybrané (předvyplněné) třídy. */
export function ApprovalsTab({ users, classes }: { users: UserRow[]; classes: ClassOption[] }) {
  const router = useRouter();
  const pending = useMemo(() => pendingApprovals(users), [users]);
  // třída vybraná u řádku; výchozí je žádost uživatele
  const [classChoice, setClassChoice] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [reject, setReject] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const classOf = (u: UserRow) => classChoice[u.id] ?? u.requestedClassGroupId ?? "";
  const nameOf = (u: UserRow) => formatName(u, "text");

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setSelected([]);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = pending.length > 0 && selected.length === pending.length;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Ke schválení</CardTitle>
          <CardDescription>
            Noví uživatelé jsou hosté. Schválením se z hosta stane student zařazený do vybrané třídy.
          </CardDescription>
        </div>
        <Button
          disabled={busy || selected.length === 0}
          data-testid="approve-selected"
          onClick={() =>
            run(
              async () => unwrap(await approveUsers(selected.map((userId) => ({ userId, classGroupId: classOf(pending.find((u) => u.id === userId)!) || null })))),
              `Schváleno: ${selected.length}.`
            )
          }
        >
          Schválit vybrané{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="no-approvals">Nikdo nečeká na schválení.</p>
        ) : (
          <Table data-testid="approvals-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    aria-label="Vybrat všechny"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : pending.map((u) => u.id))}
                  />
                </TableHead>
                <TableHead>Příjmení a jméno</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Registrace</TableHead>
                <TableHead>Třída</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((u) => (
                <TableRow key={u.id} data-user={u.email}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Vybrat ${nameOf(u)}`}
                      checked={selected.includes(u.id)}
                      onChange={() => toggle(u.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{formatName(u, "list")}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="whitespace-nowrap">{u.createdAt ? formatDateTime(u.createdAt) : "—"}</TableCell>
                  <TableCell>
                    <NativeSelect
                      compact
                      className="w-[150px]"
                      aria-label={`Třída – ${nameOf(u)}`}
                      value={classOf(u)}
                      onChange={(e) => setClassChoice((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    >
                      <option value="">— bez třídy —</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      disabled={busy}
                      data-testid="approve"
                      onClick={() => run(async () => unwrap(await approveUser(u.id, classOf(u) || null)), `${nameOf(u)}: schváleno jako student.`)}
                    >
                      Schválit
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="ml-1 h-8 w-8 p-0" aria-label={`Další možnosti – ${nameOf(u)}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => run(async () => unwrap(await approveAsTeacher(u.id)), `${nameOf(u)}: schváleno jako učitel.`)}
                        >
                          Schválit jako učitele
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-danger" onSelect={() => setReject(u)}>
                          Zamítnout
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmAction
        open={!!reject}
        onOpenChange={(o) => !o && setReject(null)}
        title="Zamítnout žádost?"
        description={`Účet ${reject ? nameOf(reject) : ""} (${reject?.email ?? ""}) se deaktivuje a žádost o třídu se smaže. Trvale ho můžete smazat ve správě uživatelů.`}
        actionLabel="Zamítnout"
        onConfirm={async () => {
          if (reject) await run(async () => unwrap(await rejectUser(reject.id)), `${nameOf(reject)}: zamítnuto.`);
        }}
      />
    </Card>
  );
}
