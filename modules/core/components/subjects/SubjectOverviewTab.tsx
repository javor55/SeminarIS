import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subjectGradesLabel } from "@/lib/school";
import { formatDateTime } from "@/lib/datetime";
import { SubjectBadgeChip } from "@/modules/core/components/subjects/SubjectBadgeChip";
import type { SubjectDetail } from "@/modules/core/actions/subjects";

/** Záložka „Přehled“ detailu předmětu: popis, kód, ročníky, štítky z modulů, sylabus. */
export function SubjectOverviewTab({ subject, showAudit }: { subject: SubjectDetail; showAudit: boolean }) {
  return (
    <div className="space-y-6" data-testid="subject-overview">
      <Card className="shadow-sm">
        <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="text-xs uppercase font-semibold text-muted-foreground">Popis</div>
            <div data-testid="subject-description">{subject.description || <span className="text-muted-foreground">Tento předmět nemá popis.</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-muted-foreground">Zkratka</div>
            <div data-testid="subject-code">{subject.code ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-muted-foreground">Ročníky</div>
            <div data-testid="subject-grades">{subjectGradesLabel(subject.grades)}</div>
          </div>
          {subject.badges.length > 0 && (
            <div className="sm:col-span-2">
              <div className="text-xs uppercase font-semibold text-muted-foreground">Štítky</div>
              <div className="flex flex-wrap gap-1" data-testid="subject-badges">
                {subject.badges.map((b) => (
                  <SubjectBadgeChip key={b.id} badge={b} />
                ))}
              </div>
            </div>
          )}
          {showAudit && (
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Vytvořil: <strong>{subject.createdByName ?? "—"}</strong> dne <strong>{formatDateTime(subject.createdAt)}</strong>
              {" · "}
              Poslední úprava: <strong>{subject.updatedByName ?? "—"}</strong> dne <strong>{formatDateTime(subject.updatedAt)}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sylabus</CardTitle>
        </CardHeader>
        <CardContent>
          {subject.syllabus ? (
            <div
              className="prose prose-sm max-w-none max-h-96 overflow-y-auto pr-2"
              dangerouslySetInnerHTML={{ __html: subject.syllabus }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sylabus není k dispozici.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
