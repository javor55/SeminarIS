"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Download, Eye, History, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/datetime";
import { unwrap } from "@/lib/action-result";
import { ROLE_LABELS } from "@/lib/school";
import { can } from "@/modules/registry";
import type { ClassOverview } from "@/modules/core/actions/classes";
import { exportUsersCsv } from "@/modules/core/actions/user-bulk";
import { BULK_MAX, type BulkActionDescriptor, type BulkSelection } from "@/modules/core/bulk-runner-types";
import { BulkActionDialog } from "@/modules/core/components/users/BulkActionDialog";
import { ApprovalsTab } from "@/modules/core/components/users/ApprovalsTab";
import { ImportUsersDialog } from "@/modules/core/components/users/ImportUsersDialog";
import { ActiveCell, RoleCell } from "@/modules/core/components/users/users-cells";
import { ImpersonateButton } from "@/modules/core/components/users/ImpersonateButton";
import {
  hasUserFilter,
  serializeUserListQuery,
  USER_ROLES,
  USER_STUDY_STATUSES,
  userFilterKey,
  type UserFilter,
  type UserListQuery,
  type UserSort,
} from "@/modules/core/users-filter";
import type { UserListRow } from "@/modules/core/users-query";

const STUDY_LABELS: Record<(typeof USER_STUDY_STATUSES)[number], string> = { ACTIVE: "Studuje", GRADUATED: "Absolvent", LEFT: "Ukončil studium" };

type Props = {
  tab: "users" | "approvals";
  query: UserListQuery;
  list: { rows: UserListRow[]; total: number; page: number; pages: number } | null;
  approvals: UserListRow[] | null;
  classes: ClassOverview[];
  counts: { studying: number; noClass: number; pending: number; total: number };
  actions: BulkActionDescriptor[];
  currentUser: { id: string; role: "GUEST" | "STUDENT" | "TEACHER" | "ADMIN" };
};

export function UsersView({ tab, query, list, approvals, classes, counts, actions, currentUser }: Props) {
  const canManage = can(currentUser.role, "core.users.manage");
  const [showImport, setShowImport] = React.useState(false);
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Správa uživatelů"
        description={
          <>
            Role, třídy, stav studia a hromadné akce.
            {can(currentUser.role, "core.admin") && (
              <>
                {" "}Třídy se zakládají a spravují v{" "}
                <Link href="/admin/school-year" className="font-medium underline underline-offset-4" data-testid="classes-link">
                  Administraci → Školní rok a třídy
                </Link>
                .
              </>
            )}
          </>
        }
        actions={
          canManage && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              Import uživatelů
            </Button>
          )
        }
      />

      <div className="flex gap-1 border-b" role="tablist">
        <Link href="/users" role="tab" aria-selected={tab === "users"} data-tab="users" className={tabClass(tab === "users")}>
          Uživatelé
        </Link>
        {canManage && (
          <Link href="/users?tab=approvals" role="tab" aria-selected={tab === "approvals"} data-tab="approvals" className={tabClass(tab === "approvals")}>
            Ke schválení ({counts.pending})
          </Link>
        )}
      </div>

      <ImportUsersDialog open={showImport} onOpenChange={setShowImport} onSuccess={() => router.refresh()} />

      {tab === "approvals" && canManage && approvals && <ApprovalsTab users={approvals} classes={classes} />}
      {tab === "users" && list && (
        <UsersList query={query} list={list} classes={classes} counts={counts} actions={actions} currentUser={currentUser} onImport={() => setShowImport(true)} />
      )}
    </div>
  );
}

const tabClass = (active: boolean) =>
  `-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;

function UsersList({
  query,
  list,
  classes,
  counts,
  actions,
  currentUser,
  onImport,
}: Omit<Props, "tab" | "approvals"> & { list: NonNullable<Props["list"]>; onImport: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = React.useTransition();
  const canImpersonate = can(currentUser.role, "core.impersonate");
  const canBulk = actions.length > 0;

  // === Filtr v URL ===
  const go = React.useCallback(
    (next: UserListQuery) => {
      const qs = serializeUserListQuery(next).toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [router, pathname]
  );
  const setFilter = (patch: Partial<UserListQuery>) => go({ ...query, ...patch, page: undefined });

  const [q, setQ] = React.useState(query.q ?? "");
  React.useEffect(() => setQ(query.q ?? ""), [query.q]);
  React.useEffect(() => {
    if (q.trim() === (query.q ?? "")) return;
    const t = setTimeout(() => setFilter({ q: q.trim() || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sortBy = (sort: UserSort) => {
    const current = query.sort ?? "name";
    const dir = current === sort ? ((query.dir ?? (sort === "created" || sort === "login" ? "desc" : "asc")) === "asc" ? "desc" : "asc") : undefined;
    go({ ...query, sort, dir, page: undefined });
  };
  const SortIcon = ({ sort }: { sort: UserSort }) => {
    if ((query.sort ?? "name") !== sort) return null;
    return (query.dir ?? (sort === "created" || sort === "login" ? "desc" : "asc")) === "asc" ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
  };

  // === Výběr řádků ===
  // `selected`: ručně zaškrtnutá id (i z jiných stránek); `allMatching`: „vybrat vše odpovídající filtru“,
  // pak se o řádcích rozhoduje na serveru podle filtru a `excluded` jsou odškrtnuté výjimky.
  const filterKey = userFilterKey(query);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = React.useState(false);
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const lastKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      setSelected(new Set());
      setAllMatching(false);
      setExcluded(new Set());
    }
  }, [filterKey]);

  const isChecked = (id: string) => (allMatching ? !excluded.has(id) : selected.has(id));
  const toggle = (id: string) => {
    if (allMatching) setExcluded((s) => toggled(s, id));
    else setSelected((s) => toggled(s, id));
  };
  const pageIds = list.rows.map((r) => r.id);
  const pageAllChecked = pageIds.length > 0 && pageIds.every(isChecked);
  const togglePage = () => {
    const set = (s: Set<string>, on: boolean) => {
      const n = new Set(s);
      for (const id of pageIds) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    };
    if (allMatching) setExcluded((s) => set(s, pageAllChecked));
    else setSelected((s) => set(s, !pageAllChecked));
  };
  const clearSelection = () => {
    setSelected(new Set());
    setAllMatching(false);
    setExcluded(new Set());
  };
  const selectedCount = allMatching ? list.total - excluded.size : selected.size;
  const selection: BulkSelection = allMatching
    ? { mode: "filter", filter: stripPaging(query), excluded: [...excluded] }
    : { mode: "ids", ids: [...selected] };

  // === Akce ===
  const [dialogAction, setDialogAction] = React.useState<BulkActionDescriptor | null>(null);
  const [exporting, setExporting] = React.useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      // bez výběru se exportuje vše odpovídající filtru
      const sel: BulkSelection = selectedCount > 0 ? selection : { mode: "filter", filter: stripPaging(query) };
      const res = unwrap(await exportUsersCsv(sel));
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Export dokončen: ${res.count} uživatelů.`);
    } catch (e) {
      toast.error((e as Error).message || "Export se nepodařil.");
    } finally {
      setExporting(false);
    }
  }

  const filtered = hasUserFilter(query);
  const showBanner = canBulk && !allMatching && pageAllChecked && list.total > list.rows.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="user-counts">
        <Tile label="Všichni uživatelé" value={counts.total} href="/users" />
        <Tile label="Studujících" value={counts.studying} href="/users?role=STUDENT&study=ACTIVE&active=1" />
        <Tile label="Bez třídy" value={counts.noClass} href="/users?noclass=1" tone="text-amber-600" />
        <Tile label="Čeká na schválení" value={counts.pending} href={can(currentUser.role, "core.users.manage") ? "/users?tab=approvals" : "/users?pending=1"} tone="text-orange-600" />
      </div>

      {counts.total <= 1 && !filtered ? (
        <Card className="border-dashed py-12">
          <CardContent className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="max-w-[400px]">
              <h3 className="text-lg font-semibold">Zatím žádní další uživatelé</h3>
              <p className="text-sm text-muted-foreground">
                V systému jste zatím jen vy. Importujte seznam studentů ze souboru CSV, nebo nechte studenty, aby se registrovali sami.
              </p>
            </div>
            {can(currentUser.role, "core.users.manage") && (
              <Button onClick={onImport} className="gap-2">
                <Upload className="w-4 h-4" />
                Importovat první studenty
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filtry */}
          <div className="flex flex-wrap items-end gap-2" data-testid="user-filters">
            <Input
              className="w-full sm:w-[260px]"
              placeholder="Hledat podle jména nebo e-mailu…"
              aria-label="Hledat"
              data-testid="filter-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <FilterSelect label="Role" id="role" value={query.role ?? ""} onChange={(v) => setFilter({ role: (v || undefined) as UserListQuery["role"] })}>
              <option value="">Všechny role</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Třída" id="class" value={query.class ?? ""} onChange={(v) => setFilter({ class: v || undefined })}>
              <option value="">Všechny třídy</option>
              {classes.map((c) => (
                <option key={c.id} value={c.label}>{c.label}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Ročník" id="grade" value={query.grade ? String(query.grade) : ""} onChange={(v) => setFilter({ grade: v ? Number(v) : undefined })}>
              <option value="">Všechny ročníky</option>
              {[...new Set(classes.map((c) => c.grade))].map((g) => (
                <option key={g} value={g}>{g}. ročník</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Studium" id="study" value={query.study ?? ""} onChange={(v) => setFilter({ study: (v || undefined) as UserListQuery["study"] })}>
              <option value="">Jakýkoli stav studia</option>
              {USER_STUDY_STATUSES.map((s) => (
                <option key={s} value={s}>{STUDY_LABELS[s]}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Účet" id="active" value={query.active === undefined ? "" : query.active ? "1" : "0"} onChange={(v) => setFilter({ active: v === "" ? undefined : v === "1" })}>
              <option value="">Aktivní i neaktivní</option>
              <option value="1">Aktivní</option>
              <option value="0">Neaktivní</option>
            </FilterSelect>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" data-testid="filter-pending" checked={!!query.pending} onChange={(e) => setFilter({ pending: e.target.checked || undefined })} />
              Ke schválení
            </label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" data-testid="filter-noclass" checked={!!query.noClass} onChange={(e) => setFilter({ noClass: e.target.checked || undefined })} />
              Bez třídy
            </label>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={() => go({})} data-testid="filter-reset">
                Zrušit filtry
              </Button>
            )}
          </div>

          {/* Výběr a hromadné akce */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2" data-testid="bulk-bar">
            <span className="text-sm" data-testid="selection-count">
              {selectedCount > 0 ? (
                <>
                  Vybráno: <strong>{selectedCount}</strong>
                </>
              ) : (
                <>Nalezeno: <strong data-testid="total-count">{list.total}</strong></>
              )}
            </span>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Zrušit výběr
              </Button>
            )}
            {canBulk && selectedCount > 0 && (
              <NativeSelect
                compact
                className="w-[220px]"
                aria-label="Hromadná akce"
                data-testid="bulk-action-select"
                value=""
                onChange={(e) => {
                  const a = actions.find((x) => x.id === e.target.value);
                  if (a) setDialogAction(a);
                }}
              >
                <option value="">Hromadná akce…</option>
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </NativeSelect>
            )}
            <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={exportCsv} disabled={exporting} data-testid="export-csv">
              <Download className="w-4 h-4" />
              {selectedCount > 0 ? `Export vybraných (${selectedCount})` : `Export CSV (${list.total})`}
            </Button>
          </div>
          {showBanner && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="select-all-banner">
              Vybráno {selectedCount} na této stránce.{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-4"
                data-testid="select-all-matching"
                onClick={() => {
                  setAllMatching(true);
                  setExcluded(new Set());
                }}
              >
                Vybrat všech {list.total} odpovídajících filtru
              </button>
              {list.total > BULK_MAX && <span className="text-muted-foreground"> (nejvýš {BULK_MAX} najednou, zúžte filtr)</span>}
            </div>
          )}
          {allMatching && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="all-matching-banner">
              Vybráno všech <strong>{list.total}</strong> uživatelů odpovídajících filtru{excluded.size > 0 ? `, kromě ${excluded.size} odškrtnutých` : ""}.
            </div>
          )}

          <div className="rounded-md border">
            <Table data-testid="users-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <input type="checkbox" aria-label="Vybrat stránku" data-testid="select-page" checked={pageAllChecked} onChange={togglePage} />
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => sortBy("name")} className="font-medium">Jméno<SortIcon sort="name" /></button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => sortBy("email")} className="font-medium">E-mail<SortIcon sort="email" /></button>
                  </TableHead>
                  <TableHead>Třída</TableHead>
                  <TableHead>
                    <button type="button" onClick={() => sortBy("created")} className="font-medium">Registrace<SortIcon sort="created" /></button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => sortBy("login")} className="font-medium">Poslední přihlášení<SortIcon sort="login" /></button>
                  </TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Aktivní</TableHead>
                  <TableHead>Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground" data-testid="no-users">
                      Filtru neodpovídá žádný uživatel.
                    </TableCell>
                  </TableRow>
                )}
                {list.rows.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const name = `${u.firstName} ${u.lastName}`;
                  return (
                    <TableRow key={u.id} data-user={u.email} data-testid="user-row">
                      <TableCell>
                        <input type="checkbox" aria-label={`Vybrat ${name}`} checked={isChecked(u.id)} onChange={() => toggle(u.id)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/users/${u.id}`} className="hover:underline" data-testid="user-link">{name}</Link>
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {u.classLabel || "—"}
                        {u.studyLabel && <span className="ml-1 text-xs text-muted-foreground">· {u.studyLabel}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(u.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</TableCell>
                      <TableCell>
                        <RoleCell user={u} canEdit={can(currentUser.role, "core.users.manage") && !isSelf} />
                      </TableCell>
                      <TableCell>
                        <ActiveCell user={u} canEdit={can(currentUser.role, "core.users.manage") && !isSelf} isSelf={isSelf} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Detail uživatele">
                            <Link href={`/users/${u.id}`} aria-label={`Detail – ${name}`} data-testid="user-detail-link">
                              <Eye className="w-4 h-4 text-emerald-600" />
                            </Link>
                          </Button>
                          {can(currentUser.role, "core.admin") && (
                            <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Historie změn">
                              <Link href={`/admin/history?user=${u.id}`} data-testid="user-history" aria-label={`Historie – ${name}`}>
                                <History className="w-4 h-4" />
                              </Link>
                            </Button>
                          )}
                          {canImpersonate && !isSelf && u.role !== "ADMIN" && u.isActive && <ImpersonateButton userId={u.id} name={name} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground" data-testid="pagination">
            <span>
              Strana {list.page} z {list.pages} · {list.total} uživatelů
            </span>
            <div className="flex gap-2">
              <PageLink query={query} page={list.page - 1} disabled={list.page <= 1} testId="page-prev">Předchozí</PageLink>
              <PageLink query={query} page={list.page + 1} disabled={list.page >= list.pages} testId="page-next">Další</PageLink>
            </div>
          </div>
        </>
      )}

      <BulkActionDialog
        action={dialogAction}
        selection={selection}
        onClose={() => setDialogAction(null)}
        onDone={() => {
          setDialogAction(null);
          clearSelection();
          router.refresh();
        }}
      />
    </div>
  );
}

function toggled(s: Set<string>, id: string) {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

/** Jen filtr (bez řazení a stránky): tím se vybírá „vše odpovídající filtru“. */
function stripPaging(q: UserListQuery): UserFilter {
  return { q: q.q, role: q.role, class: q.class, grade: q.grade, study: q.study, active: q.active, pending: q.pending, noClass: q.noClass };
}

function Tile({ label, value, href, tone }: { label: string; value: number; href: string; tone?: string }) {
  return (
    <Link href={href} className="rounded-lg border bg-card p-3 hover:bg-accent/50">
      <p className={`text-2xl font-bold ${tone ?? ""}`}>{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </Link>
  );
}

/* eslint-disable no-unused-vars -- název parametru v typu funkce */
function FilterSelect({ label, id, value, onChange, children }: { label: string; id: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <NativeSelect className="w-[170px]" aria-label={label} data-testid={`filter-${id}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </NativeSelect>
  );
}

function PageLink({ query, page, disabled, testId, children }: { query: UserListQuery; page: number; disabled: boolean; testId: string; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md border px-3 py-1 opacity-50">{children}</span>;
  const qs = serializeUserListQuery({ ...query, page }).toString();
  return (
    <Link href={`/users?${qs}`} className="rounded-md border px-3 py-1 hover:bg-accent" data-testid={testId}>
      {children}
    </Link>
  );
}
