"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importUsers } from "@/lib/data";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ImportUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ImportUsersDialog({ open, onOpenChange, onSuccess }: ImportUsersDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [templateSize, setTemplateSize] = React.useState(10);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{ created: number; updated: number; errors: number } | null>(null);

  const handleDownloadTemplate = () => {
    const headers = ["firstName", "lastName", "email", "cohort", "role", "isActive", "password"];
    const rows = [headers];

    for (let i = 1; i <= templateSize; i++) {
      const password = Math.random().toString(36).slice(-8);
      rows.push([
        `Student${i}`,
        `Testovací`,
        `student${i}@example.cz`,
        "2023/2024",
        "STUDENT",
        "TRUE",
        password
      ]);
    }

    const csvContent = "\uFEFF" + rows.map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sablona_importu_${templateSize}_studentu.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        const headers = lines[0].split(";").map(h => h.trim());
        
        const json = lines.slice(1).map(line => {
          const values = line.split(";").map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, index) => {
            let val = values[index];
            if (header === "isActive") {
              obj[header] = val.toUpperCase() === "TRUE" || val === "1" || val.toUpperCase() === "ANO";
            } else {
              obj[header] = val;
            }
          });
          return obj;
        });

        const res = await importUsers(json);
        setImportResult(res);
        toast.success("Import dokončen");
        onSuccess();
      } catch (err) {
        console.error(err);
        toast.error("Chyba při parsování CSV souboru.");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) {
        setFile(null);
        setImportResult(null);
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" />
            Import uživatelů
          </DialogTitle>
          <DialogDescription>
            Nahrajte CSV soubor pro hromadné vytvoření nebo aktualizaci studentů.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Šablona */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Download className="w-4 h-4 text-slate-500" />
              1. Stáhnout šablonu
            </h4>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="size" className="text-[10px] uppercase text-muted-foreground font-bold">Počet řádků</Label>
                <Input 
                  id="size" 
                  type="number" 
                  value={templateSize} 
                  onChange={(e) => setTemplateSize(Number(e.target.value))}
                  className="h-9 mt-1" 
                />
              </div>
              <Button onClick={handleDownloadTemplate} variant="outline" className="mt-5 h-9 gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Stáhnout CSV
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              Šablona obsahuje náhodně vygenerovaná hesla studentů, které jim pak můžete předat.
            </p>
          </div>

          {/* Nahrání */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-600" />
              2. Nahrát vyplněný soubor
            </h4>
            <div className="grid w-full items-center gap-1.5 font-sans">
              <Input 
                id="csv-file" 
                type="file" 
                accept=".csv" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {importResult && (
            <Alert className={importResult.errors > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}>
              <div className="flex items-center gap-2 mb-1">
                {importResult.errors > 0 ? <AlertCircle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                <AlertTitle className="mb-0">Výsledek importu</AlertTitle>
              </div>
              <AlertDescription className="text-sm">
                Úspěšně zpracováno: <strong>{importResult.created}</strong><br />
                Chyb: <strong>{importResult.errors}</strong>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Zavřít
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={!file || isImporting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importuji...
              </>
            ) : (
              "Spustit import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
