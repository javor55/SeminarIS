"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportDialog, type ImportOption } from "./ImportDialog";
import { ASSIGNMENTS_SAMPLE, SUBJECTS_SAMPLE, USERS_SAMPLE } from "@/lib/import-samples";
import {
  confirmAssignmentsImport,
  confirmSubjectsImport,
  confirmUsersImport,
  previewAssignmentsImport,
  previewSubjectsImport,
  previewUsersImport,
} from "@/modules/core/actions/imports";

type DialogProps = { open: boolean; onOpenChange: (_open: boolean) => void };

const UPDATE_OPTION = (what: string): ImportOption[] => [
  { key: "update", label: "Aktualizovat existující", description: what, default: true },
];

export function ImportUsersDialog(props: DialogProps) {
  const router = useRouter();
  return (
    <ImportDialog
      {...props}
      kind="users"
      title="Import uživatelů"
      description={
        <>
          CSV se sloupci <code>email</code> (klíč), <code>firstName</code>, <code>lastName</code>, <code>class</code>, <code>role</code>, <code>isActive</code>,{" "}
          <code>password</code> (české názvy jako jméno, příjmení, třída, heslo jsou také v pořádku). Hesla stávajících uživatelů se nemění.
        </>
      }
      sample={{ filename: "vzor_import_uzivatelu.csv", content: USERS_SAMPLE }}
      options={UPDATE_OPTION("U existujících uživatelů se změní jméno, třída a role podle souboru.")}
      preview={previewUsersImport as never}
      confirm={confirmUsersImport as never}
      onDone={() => router.refresh()}
    />
  );
}

export function ImportAssignmentsDialog(props: DialogProps) {
  const router = useRouter();
  return (
    <ImportDialog
      {...props}
      kind="assignments"
      title="Import úvazků"
      description={
        <>
          CSV <code>email_ucitele;kod_predmetu;trida</code> (např. <code>novak@skola.cz;M;2.A</code>) pro aktuální školní rok. Přidávají se jen chybějící
          úvazky, třídy se nezakládají.
        </>
      }
      sample={{ filename: "vzor_import_uvazku.csv", content: ASSIGNMENTS_SAMPLE }}
      preview={previewAssignmentsImport as never}
      confirm={confirmAssignmentsImport as never}
      onDone={() => router.refresh()}
    />
  );
}

export function ImportSubjectsDialog(props: DialogProps) {
  const router = useRouter();
  return (
    <ImportDialog
      {...props}
      kind="subjects"
      title="Import předmětů"
      description={
        <>
          CSV <code>nazev;kod;rocniky</code> (ročníky např. <code>1,2,3</code> nebo <code>2-4</code>, prázdné = všechny). Předmět se páruje podle zkratky,
          bez zkratky podle názvu.
        </>
      }
      sample={{ filename: "vzor_import_predmetu.csv", content: SUBJECTS_SAMPLE }}
      options={UPDATE_OPTION("U existujících předmětů se změní název a ročníky podle souboru.")}
      preview={previewSubjectsImport as never}
      confirm={confirmSubjectsImport as never}
      onDone={() => router.refresh()}
    />
  );
}

/** Tlačítko + dialog pro stránky, které jsou server komponenty. */
export function ImportButton({ kind, label, variant = "outline" }: { kind: "assignments" | "subjects" | "users"; label: string; variant?: "outline" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const Dialog = kind === "assignments" ? ImportAssignmentsDialog : kind === "subjects" ? ImportSubjectsDialog : ImportUsersDialog;
  return (
    <>
      <ImportTrigger label={label} variant={variant} kind={kind} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ImportTrigger({ label, variant, kind, onClick }: { label: string; variant: "outline" | "default"; kind: string; onClick: () => void }) {
  return (
    <Button type="button" variant={variant} size="sm" className="gap-2" onClick={onClick} data-testid={`import-open-${kind}`}>
      <Upload className="h-4 w-4" />
      {label}
    </Button>
  );
}
