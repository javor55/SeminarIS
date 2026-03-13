"use client";

import * as React from "react";
import { UserRow } from "./users-columns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, Mail, GraduationCap, History } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn, computeEnrollmentStatus } from "@/lib/utils";


interface UserDetailsDialogProps {
  user: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserDetailsDialog({ user, open, onOpenChange }: UserDetailsDialogProps) {
  if (!user) return null;

  const enrollments = user.studentEnrollments || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-600" />
            Detail uživatele
          </DialogTitle>
          <DialogDescription>
            Podrobné informace o profilu a historii zápisů.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Základní info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-semibold">Jméno a příjmení</span>
                <span className="font-medium">{user.firstName} {user.lastName}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                  <Mail className="w-3 h-3" /> E-mail
                </span>
                <span className="font-medium text-emerald-700">{user.email}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" /> Role a Ročník
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {user.role}
                  </Badge>
                  {user.cohort && (
                    <Badge variant="secondary">
                      {user.cohort}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Registrace
                </span>
                <span className="text-sm">
                  {user.createdAt ? new Date(user.createdAt).toLocaleString("cs-CZ", { dateStyle: "long" }) : "—"}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Historie zápisů */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" />
              Historie a stav zápisů ({enrollments.length})
            </h3>

            {enrollments.length > 0 ? (
              <div className="border rounded-md divide-y overflow-hidden bg-slate-50/30">
                {enrollments.map((en: any) => {
                  const window = en.subjectOccurrence?.block?.enrollmentWindow;
                  const subject = en.subjectOccurrence?.subject;
                  const block = en.subjectOccurrence?.block;
                  
                  const statusMeta = computeEnrollmentStatus(window?.status ?? "CLOSED", window?.startsAt, window?.endsAt);
                  
                  return (
                    <div key={en.id} className="p-3 text-sm hover:bg-accent transition-colors">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900">
                            {subject?.name || "Neznámý předmět"} 
                            {subject?.code && <span className="text-xs text-muted-foreground ml-1">({subject.code})</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {window?.name || "Zápisové okno"} • {block?.name || "Blok"}
                          </p>
                        </div>
                        <Badge 
                          variant={statusMeta.is === "open" ? "default" : "outline"} 
                          className={cn(
                            "text-[10px] uppercase font-bold px-1.5 h-5",
                            statusMeta.is === "open" && "bg-emerald-600 hover:bg-emerald-600 text-white",
                            statusMeta.is === "planned" && "bg-blue-100 text-blue-700 border-blue-200"
                          )}
                        >
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed rounded-md bg-muted/50">
                <p className="text-sm text-muted-foreground italic">Uživatel zatím nemá žádné zápisy.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


