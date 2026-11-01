"use client";

import { EnrollmentBlocks } from "@/modules/seminars/components/enrollment/EnrollmentBlocks";
import { EnrollmentHeader } from "@/modules/seminars/components/enrollment/EnrollmentHeader"; // <-- Import nové hlavičky
import { User, EnrollmentWindowWithBlocks } from "@/lib/types";
import type { ReactNode } from "react";

// Definujeme props, které komponenta přijímá
type EnrollmentViewProps = {
  enrollmentWindow: EnrollmentWindowWithBlocks;
  currentUser: User;
  // Průběh zápisu (souhrn a „Chybí dokončit“) mezi hlavičkou a bloky
  summary?: ReactNode;
};

export function EnrollmentView({
  enrollmentWindow: ew, // Přejmenováno pro snazší C/P
  currentUser: user,   // Přejmenováno pro snazší C/P
  summary,
}: EnrollmentViewProps) {
  
  // Veškerá logika (časovač, stavy) je nyní přesunuta do EnrollmentHeader
  
  return (
    <div className="space-y-6">
      {/* 1. Komponenta hlavičky */}
      <EnrollmentHeader enrollmentWindow={ew} currentUser={user} />
      
      {summary}

      {/* 2. Komponenta seznamu bloků */}
      <EnrollmentBlocks enrollment={ew} currentUser={user} />
      
      {/* Dialog pro úpravu je nyní také řešen uvnitř EnrollmentHeader */}
    </div>
  );
}