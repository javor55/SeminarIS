"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Subject } from "@/lib/types";
import Link from "next/link";
import { getAllUsers } from "@/lib/data";

const users = getAllUsers();
const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

export type SubjectRow = Subject & {
  createdAt?: string;
  updatedAt?: string;
  createdById?: string;
  updatedById?: string;
};

export const subjectsColumns: ColumnDef<SubjectRow>[] = [
  {
    accessorKey: "name",
    header: "Předmět",
    cell: ({ row }) => {
      const s = row.original;
      return (
        <Link
          href={`/subjects/${s.id}`}
          className="text-blue-600 hover:underline"
        >
          {s.name}
        </Link>
      );
    },
  },
  {
    accessorKey: "code",
    header: "Kód",
    cell: ({ row }) => row.original.code ?? "—",
  },
  {
    accessorKey: "createdById",
    header: "Vytvořil",
    //cell: ({ row }) => row.original.createdById ?? "—",
    cell: ({ row }) => userMap.get(row.original.createdById) ?? row.original.createdById ?? "—",
  },
  {
    accessorKey: "createdAt",
    header: "Vytvořen",
    cell: ({ row }) =>
      row.original.createdAt
        ? new Date(row.original.createdAt).toLocaleString()
        : "—",
  },
    {
    accessorKey: "updatedById",
    header: "Upravil",
    //cell: ({ row }) => row.original.updatedById ?? "—",
    cell: ({ row }) => userMap.get(row.original.updatedById) ?? row.original.updatedById ?? "—",

  },
  {
    accessorKey: "updatedAt",
    header: "Aktualizován",
    cell: ({ row }) =>
      row.original.updatedAt
        ? new Date(row.original.updatedAt).toLocaleString()
        : "—",
  },
];
