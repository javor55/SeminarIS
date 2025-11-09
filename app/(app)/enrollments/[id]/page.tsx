import { getCurrentUser, getEnrollmentWindowByIdWithBlocks } from "@/lib/data";
import { notFound } from "next/navigation";
import { EnrollmentBlocks } from "@/components/enrollment/EnrollmentBlocks";

export default function EnrollmentDetail({ params }: { params: { id: string } }) {
  const user = getCurrentUser();
  const enrollment = getEnrollmentWindowByIdWithBlocks(params.id);
  if (!enrollment) notFound();

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{enrollment.name}</h1>
          <p className="text-slate-500">
            {enrollment.status} • {new Date(enrollment.startsAt).toLocaleString()} – {new Date(enrollment.endsAt).toLocaleString()}
          </p>
        </div>
        {isAdmin && (
          <button className="px-4 py-2 bg-slate-900 text-white rounded-md">
            Uložit nastavení
          </button>
        )}
      </div>
      <EnrollmentBlocks enrollment={enrollment} currentUser={user} />
    </div>
  );
}
