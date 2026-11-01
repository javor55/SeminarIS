// Kód výskytu předmětu: kód předmětu, s podkódem „KAJ/A“, bez podkódu jen „KAJ“ (nikdy koncové lomítko).

export function occurrenceCode(subjectCode: string | null | undefined, subCode: string | null | undefined): string {
  const code = subjectCode?.trim() ?? "";
  const sub = subCode?.trim() ?? "";
  if (code && sub) return `${code}/${sub}`;
  return code || sub;
}
