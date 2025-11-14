"use client";

import { EnrollmentBlocks } from "@/components/enrollment/EnrollmentBlocks";
import { EnrollmentHeader } from "@/components/enrollment/EnrollmentHeader"; // <-- Import nové hlavičky
import { User, EnrollmentWindowWithBlocks } from "@/lib/types";

// Definujeme props, které komponenta přijímá
type EnrollmentViewProps = {
  enrollmentWindow: EnrollmentWindowWithBlocks;
  currentUser: User;
};

export function EnrollmentView({
  enrollmentWindow: ew, // Přejmenováno pro snazší C/P
  currentUser: user,   // Přejmenováno pro snazší C/P
}: EnrollmentViewProps) {
  
  // Veškerá logika (časovač, stavy) je nyní přesunuta do EnrollmentHeader
  
  return (
    <div className="space-y-6">
      {/* 1. Komponenta hlavičky */}
      <EnrollmentHeader enrollmentWindow={ew} currentUser={user} />
      
      {/* 2. Komponenta seznamu bloků */}
      <EnrollmentBlocks enrollment={ew} currentUser={user} />
      
      {/* Dialog pro úpravu je nyní také řešen uvnitř EnrollmentHeader */}
    </div>
  );
}