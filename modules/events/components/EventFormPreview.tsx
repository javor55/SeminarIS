import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_CONSENT_TEXT, EMAIL_LABEL, PRIVACY_LINK_TEXT, effectiveFields, type FormField } from "@/modules/events/form";

/**
 * Náhled formuláře účastníka: e-mail vždy první, pak zobrazená pole podle nastavení, souhlas vždy poslední.
 * Pole jsou jen k prohlížení (nic se neodesílá); veřejná stránka z U7 použije stejné pořadí a popisky.
 */
export function EventFormPreview({ fields, allowGuests, maxGuests, consentText }: { fields: FormField[]; allowGuests: boolean; maxGuests: number; consentText: string }) {
  const shown = effectiveFields(fields, allowGuests).filter((f) => f.mode !== "HIDDEN");
  const star = <span aria-hidden className="text-danger"> *</span>;

  return (
    <div className="space-y-4" data-testid="form-preview">
      <PreviewRow id="pv-email" label={EMAIL_LABEL} required>
        <Input id="pv-email" type="email" placeholder="jmeno@domena.cz" readOnly tabIndex={-1} />
      </PreviewRow>
      {shown.map((f) => {
        const id = `pv-${f.key}`;
        const required = f.mode === "REQUIRED";
        if (f.type === "CHECKBOX") {
          return (
            <div key={f.key} data-field={f.key}>
              <Checkbox id={id} disabled tabIndex={-1} label={<span>{f.label}{required && star}</span>} />
            </div>
          );
        }
        return (
          <PreviewRow key={f.key} id={id} label={f.label} required={required} fieldKey={f.key} hint={f.key === "guests" ? `Kolik osob přijde s vámi, nejvýše ${maxGuests}.` : undefined}>
            {f.type === "TEXTAREA" ? (
              <Textarea id={id} rows={3} readOnly tabIndex={-1} />
            ) : f.type === "SELECT" ? (
              <NativeSelect id={id} disabled tabIndex={-1} defaultValue="">
                <option value="">— vyberte —</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </NativeSelect>
            ) : (
              <Input id={id} readOnly tabIndex={-1} />
            )}
          </PreviewRow>
        );
      })}
      <div data-field="consent" className="space-y-1 rounded-md border bg-muted/30 p-3">
        <Checkbox
          id="pv-consent"
          disabled
          tabIndex={-1}
          label={
            <span>
              {consentText.trim() || DEFAULT_CONSENT_TEXT} <Link href="/ochrana-udaju" target="_blank" className="text-primary underline">{PRIVACY_LINK_TEXT}</Link>
              {star}
            </span>
          }
        />
      </div>
    </div>
  );
}

function PreviewRow({ id, label, required, hint, fieldKey, children }: { id: string; label: string; required?: boolean; hint?: string; fieldKey?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1" data-field={fieldKey ?? "email"}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
