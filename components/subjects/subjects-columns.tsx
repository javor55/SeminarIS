"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Subject } from "@/lib/types";
import Link from "next/link";
import { getAllUsers } from "@/lib/data";
import { useState, useEffect } from "react";

const UserCell = ({ userId }: { userId?: string | null }) => {
  const [name, setName] = useState<string>("—");
  useEffect(() => {
    if (!userId) return;
    getAllUsers().then((users) => {
      const u = users.find(x => x.id === userId);
      if (u) setName(`${u.firstName} ${u.lastName}`);
    }).catch(() => {});
  }, [userId]);
  return <span>{name}</span>;
};

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
    cell: ({ row }) => <UserCell userId={row.original.createdById} />,
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
    cell: ({ row }) => <UserCell userId={row.original.updatedById} />,

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
