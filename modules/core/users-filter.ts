// Filtr seznamu uživatelů. Čistá data bez závislosti na DB: používá ho server (dotaz, hromadné akce)
// i klient (formulář filtrů, adresa). Celý filtr je v URL (`/users?role=STUDENT&class=3.A`), aby šel sdílet.

import { parseClassLabel } from "@/lib/school";

export const USER_ROLES = ["GUEST", "STUDENT", "TEACHER", "ADMIN"] as const;
export const USER_STUDY_STATUSES = ["ACTIVE", "GRADUATED", "LEFT"] as const;
export const USER_SORTS = ["name", "email", "created", "login"] as const;

export type UserSort = (typeof USER_SORTS)[number];

export type UserFilter = {
  // fulltext: jméno, příjmení, e-mail (každé slovo musí někde sedět)
  q?: string;
  role?: (typeof USER_ROLES)[number];
  // označení třídy „3.A“
  class?: string;
  // ročník 1–4
  grade?: number;
  study?: (typeof USER_STUDY_STATUSES)[number];
  // true = jen aktivní, false = jen neaktivní
  active?: boolean;
  // hosté čekající na schválení
  pending?: boolean;
  // studující studenti bez třídy
  noClass?: boolean;
};

export type UserListQuery = UserFilter & {
  sort?: UserSort;
  dir?: "asc" | "desc";
  page?: number;
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Přečte filtr z parametrů adresy; neplatné hodnoty se tiše ignorují. */
export function parseUserFilter(params: Params): UserFilter {
  const f: UserFilter = {};
  const q = get(params, "q")?.trim();
  if (q) f.q = q.slice(0, 100);
  const role = get(params, "role");
  if (role && (USER_ROLES as readonly string[]).includes(role)) f.role = role as UserFilter["role"];
  const cls = get(params, "class");
  if (cls && parseClassLabel(cls)) f.class = cls;
  const grade = Number(get(params, "grade"));
  if (Number.isInteger(grade) && grade >= 1 && grade <= 9) f.grade = grade;
  const study = get(params, "study");
  if (study && (USER_STUDY_STATUSES as readonly string[]).includes(study)) f.study = study as UserFilter["study"];
  const active = get(params, "active");
  if (active === "1") f.active = true;
  else if (active === "0") f.active = false;
  if (get(params, "pending") === "1") f.pending = true;
  if (get(params, "noclass") === "1") f.noClass = true;
  return f;
}

export function parseUserListQuery(params: Params): UserListQuery {
  const q: UserListQuery = parseUserFilter(params);
  const sort = get(params, "sort");
  if (sort && (USER_SORTS as readonly string[]).includes(sort)) q.sort = sort as UserSort;
  if (get(params, "dir") === "desc") q.dir = "desc";
  else if (get(params, "dir") === "asc") q.dir = "asc";
  const page = Math.floor(Number(get(params, "page")));
  if (Number.isFinite(page) && page > 0) q.page = page;
  return q;
}

/** Filtr (a volitelně řazení a stránka) jako parametry adresy; výchozí hodnoty se vynechají. */
export function serializeUserListQuery(query: UserListQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.role) p.set("role", query.role);
  if (query.class) p.set("class", query.class);
  if (query.grade) p.set("grade", String(query.grade));
  if (query.study) p.set("study", query.study);
  if (query.active !== undefined) p.set("active", query.active ? "1" : "0");
  if (query.pending) p.set("pending", "1");
  if (query.noClass) p.set("noclass", "1");
  if (query.sort && query.sort !== "name") p.set("sort", query.sort);
  if (query.dir && !(query.dir === "asc" && (!query.sort || query.sort === "name"))) p.set("dir", query.dir);
  if (query.page && query.page > 0) p.set("page", String(query.page));
  return p;
}

/** Klíč filtru bez řazení a stránky: když se změní, zahodí se výběr řádků. */
export function userFilterKey(filter: UserFilter): string {
  return serializeUserListQuery(filter).toString();
}

export function hasUserFilter(filter: UserFilter): boolean {
  return userFilterKey(filter) !== "";
}
