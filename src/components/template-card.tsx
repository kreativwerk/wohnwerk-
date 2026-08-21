import { Badge, Card, Field } from "./ui";
import { ConfirmButton } from "./interactive";
import {
  PLACEHOLDERS,
  TEMPLATE_KIND,
  TEMPLATE_KIND_LABEL,
  coversLandlordConfirmation,
  parseFieldMap,
} from "@/lib/pdf-template";
import {
  deletePropertyTemplate,
  savePropertyTemplateMapping,
  uploadPropertyTemplate,
} from "@/app/actions/properties";

type Template = {
  id: string;
  kind: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  fieldNames: string;
  fieldMap: string;
  uploadedAt: Date;
};

const GRUPPEN = [...new Set(PLACEHOLDERS.map((p) => p.group))];

/**
 * Vordrucke eines Objekts. Die Wohnungsgeberbestaetigung wird nie nachgebaut,
 * sondern als Datei der zustaendigen Kommune hinterlegt und nur ausgefuellt.
 */
export function PropertyTemplates({
  propertyId,
  templates,
}: {
  propertyId: string;
  templates: Template[];
}) {
  const hatBestaetigung = templates.some((t) => coversLandlordConfirmation(t.kind));

  return (
    <Card
      title="Vordrucke"
      description="Mietvertrag und Wohnungsgeberbestätigung als PDF. Wohnwerk füllt nur die Formularfelder aus – am Layout ändert sich nichts."
    >
      {!hatBestaetigung && (
        <div className="mb-5 rounded-xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-[0.875rem] leading-relaxed text-amber-900">
          <p className="font-semibold">Wohnungsgeberbestätigung fehlt</p>
          <p className="mt-0.5">
            Ohne sie kann sich ein Mieter nicht anmelden. Der Vordruck unterscheidet sich je
            Kommune, deshalb gehört hier die Datei des zuständigen Meldeamts hinterlegt.
          </p>
        </div>
      )}

      <div className="space-y-5">
        {templates.map((template) => {
          const felder = JSON.parse(template.fieldNames) as Array<{
            name: string;
            type: string;
            pages: number[];
          }>;
          const map = parseFieldMap(template.fieldMap);

          return (
            <div key={template.id} className="rounded-xl border border-ink-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[0.9rem] font-semibold text-ink-900">
                      {TEMPLATE_KIND_LABEL[template.kind] ?? template.kind}
                    </p>
                    {coversLandlordConfirmation(template.kind) && (
                      <Badge tone="success">§ 19 BMG erfüllt</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[0.8rem] text-ink-500">
                    {template.fileName} · {template.pageCount} Seiten ·{" "}
                    {Math.round(template.sizeBytes / 1024)} KB · {felder.length} Formularfeld
                    {felder.length === 1 ? "" : "er"}
                  </p>
                </div>
                <form action={deletePropertyTemplate}>
                  <input type="hidden" name="id" value={template.id} />
                  <ConfirmButton
                    className="btn btn-danger btn-sm"
                    message={`Vordruck „${template.fileName}“ wirklich entfernen?`}
                  >
                    Entfernen
                  </ConfirmButton>
                </form>
              </div>

              {felder.length === 0 ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.82rem] text-rose-800">
                  Diese PDF enthält keine Formularfelder. Wohnwerk kann sie deshalb nicht
                  ausfüllen – sie lässt sich nur als Blankovordruck ausdrucken. Felder lassen
                  sich in Acrobat oder LibreOffice ergänzen.
                </p>
              ) : (
                <form action={savePropertyTemplateMapping} className="mt-4">
                  <input type="hidden" name="id" value={template.id} />
                  <p className="mb-2 text-[0.8rem] text-ink-600">
                    Welcher Wert gehört in welches Feld? Wohnwerk hat vorbelegt, was es aus den
                    Feldnamen ableiten konnte.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {felder.map((feld) => (
                      <Field
                        key={feld.name}
                        label={feld.name}
                        hint={`Seite ${feld.pages.join(", ")}`}
                        htmlFor={`${template.id}-${feld.name}`}
                      >
                        <select
                          id={`${template.id}-${feld.name}`}
                          name={`feld:${feld.name}`}
                          defaultValue={map[feld.name] ?? ""}
                        >
                          <option value="">leer lassen</option>
                          {GRUPPEN.map((gruppe) => (
                            <optgroup key={gruppe} label={gruppe}>
                              {PLACEHOLDERS.filter((p) => p.group === gruppe).map((p) => (
                                <option key={p.key} value={p.key}>
                                  {p.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-secondary mt-4">
                    Zuordnung speichern
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <form
        action={uploadPropertyTemplate}
        encType="multipart/form-data"
        className="mt-5 border-t border-ink-200 pt-5"
      >
        <input type="hidden" name="propertyId" value={propertyId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Art des Vordrucks" htmlFor="kind">
            <select id="kind" name="kind" defaultValue={TEMPLATE_KIND.COMBINED}>
              <option value={TEMPLATE_KIND.COMBINED}>
                {TEMPLATE_KIND_LABEL[TEMPLATE_KIND.COMBINED]}
              </option>
              <option value={TEMPLATE_KIND.LANDLORD_CONFIRMATION}>
                {TEMPLATE_KIND_LABEL[TEMPLATE_KIND.LANDLORD_CONFIRMATION]}
              </option>
              <option value={TEMPLATE_KIND.CONTRACT}>
                {TEMPLATE_KIND_LABEL[TEMPLATE_KIND.CONTRACT]}
              </option>
            </select>
          </Field>
          <Field
            label="PDF-Datei"
            htmlFor="file"
            hint="Höchstens 12 MB"
            className="sm:col-span-2"
          >
            <input id="file" name="file" type="file" accept="application/pdf" required />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary mt-4">
          Vordruck hochladen
        </button>
      </form>
    </Card>
  );
}
