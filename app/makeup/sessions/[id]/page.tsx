import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSessionDetail, getUpcomingSessions } from "@/modules/makeup/actions/sessions";
import { SessionDetailView } from "@/modules/makeup/components/SessionDetailView";

export default async function MakeupSessionPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [detail, otherSessions] = await Promise.all([getSessionDetail(params.id), getUpcomingSessions()]);
  if (!detail) notFound();
  return <SessionDetailView session={detail.session} registrations={detail.registrations} otherSessions={otherSessions} />;
}
