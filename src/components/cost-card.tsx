import { Card, Table, Td, Th } from "./ui";
import { ConfirmButton, Disclosure } from "./interactive";
import { centsToInput, formatCents } from "@/lib/money";
import {
  createPropertyCost,
  deletePropertyCost,
  updatePropertyCost,
} from "@/app/actions/properties";

type Kostenposten = {
  id: string;
  label: string;
  amountCents: number;
  interval: string;
  notes: string | null;
};

/** Jaehrliche Posten gehen mit einem Zwoelftel in die Monatssumme ein. */
export function monthlyCostCents(costs: Array<{ amountCents: number; interval: string }>): number {
  return Math.round(
    costs.reduce(
      (summe, k) => summe + (k.interval === "YEARLY" ? k.amountCents / 12 : k.amountCents),
      0,
    ),
  );
}

/**
 * Unsere laufenden Kosten fuer ein Objekt: Miete an den Vermieter,
 * Nebenkosten, Strom, Oel. Bei all-inclusive angemieteten Objekten
 * reicht ein einziger Posten.
 */
export function PropertyCosts({
  propertyId,
  costs,
  currentRentCents,
  potentialRentCents,
}: {
  propertyId: string;
  costs: Kostenposten[];
  /** Monatsmieten der aktiven Mietverhaeltnisse */
  currentRentCents: number;
  /** Monatsmieten aller Betten bei Vollbelegung */
  potentialRentCents: number;
}) {
  const monatlich = monthlyCostCents(costs);
  const jaehrlich = costs.reduce(
    (summe, k) => summe + (k.interval === "YEARLY" ? k.amountCents : k.amountCents * 12),
    0,
  );
  const ueberschuss = currentRentCents - monatlich;

  return (
    <Card
      title="Unsere Kosten"
      description="Was das Objekt uns monatlich kostet – Miete an den Vermieter, Nebenkosten, Strom, Öl. Bei all-inclusive reicht ein Posten."
    >
      {costs.length > 0 && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-ink-50 px-4 py-3">
              <p className="text-[0.75rem] font-medium text-ink-500">Kosten / Monat</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                {formatCents(monatlich)}
              </p>
              <p className="mt-0.5 text-[0.72rem] text-ink-500">{formatCents(jaehrlich)} im Jahr</p>
            </div>
            <div className="rounded-xl bg-ink-50 px-4 py-3">
              <p className="text-[0.75rem] font-medium text-ink-500">Einnahmen / Monat</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                {formatCents(currentRentCents)}
              </p>
              <p className="mt-0.5 text-[0.72rem] text-ink-500">
                {formatCents(potentialRentCents)} bei Vollbelegung
              </p>
            </div>
            <div className="rounded-xl bg-ink-50 px-4 py-3">
              <p className="text-[0.75rem] font-medium text-ink-500">Überschuss / Monat</p>
              <p
                className={`mt-1 text-xl font-semibold tabular-nums ${
                  ueberschuss >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCents(ueberschuss)}
              </p>
              <p className="mt-0.5 text-[0.72rem] text-ink-500">
                {formatCents(potentialRentCents - monatlich)} bei Vollbelegung
              </p>
            </div>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Posten</Th>
                <Th align="right">Betrag</Th>
                <Th>Turnus</Th>
                <Th align="right">Je Monat</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {costs.map((k) => (
                <tr key={k.id}>
                  <Td className="font-medium">
                    {k.label}
                    {k.notes && <p className="text-xs text-ink-500">{k.notes}</p>}
                  </Td>
                  <Td align="right" className="tabular-nums">{formatCents(k.amountCents)}</Td>
                  <Td className="text-ink-600">{k.interval === "YEARLY" ? "jährlich" : "monatlich"}</Td>
                  <Td align="right" className="tabular-nums">
                    {formatCents(k.interval === "YEARLY" ? Math.round(k.amountCents / 12) : k.amountCents)}
                  </Td>
                  <Td align="right">
                    <Disclosure summary="Bearbeiten">
                      <form action={updatePropertyCost} className="grid gap-3 py-2 sm:grid-cols-4">
                        <input type="hidden" name="id" value={k.id} />
                        <div>
                          <label htmlFor={`cl-${k.id}`}>Bezeichnung</label>
                          <input id={`cl-${k.id}`} name="label" defaultValue={k.label} required />
                        </div>
                        <div>
                          <label htmlFor={`ca-${k.id}`}>Betrag (€)</label>
                          <input id={`ca-${k.id}`} name="amount" inputMode="decimal" defaultValue={centsToInput(k.amountCents)} required />
                        </div>
                        <div>
                          <label htmlFor={`ci-${k.id}`}>Turnus</label>
                          <select id={`ci-${k.id}`} name="interval" defaultValue={k.interval}>
                            <option value="MONTHLY">monatlich</option>
                            <option value="YEARLY">jährlich</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`cn-${k.id}`}>Notiz</label>
                          <input id={`cn-${k.id}`} name="notes" defaultValue={k.notes ?? ""} />
                        </div>
                        <div className="flex gap-2 sm:col-span-4">
                          <button type="submit" className="btn btn-secondary btn-sm">Speichern</button>
                        </div>
                      </form>
                      <form action={deletePropertyCost}>
                        <input type="hidden" name="id" value={k.id} />
                        <ConfirmButton className="btn btn-danger btn-sm" message={`Posten „${k.label}“ entfernen?`}>
                          Entfernen
                        </ConfirmButton>
                      </form>
                    </Disclosure>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      <form
        action={createPropertyCost}
        className={`grid gap-3 sm:grid-cols-5 ${costs.length > 0 ? "mt-5 border-t border-ink-200 pt-5" : ""}`}
      >
        <input type="hidden" name="propertyId" value={propertyId} />
        <div className="sm:col-span-2">
          <label htmlFor="cost-label">Bezeichnung</label>
          <input id="cost-label" name="label" placeholder="z. B. Miete an Vermieter, Strom, Öl" required />
        </div>
        <div>
          <label htmlFor="cost-amount">Betrag (€)</label>
          <input id="cost-amount" name="amount" inputMode="decimal" placeholder="0,00" required />
        </div>
        <div>
          <label htmlFor="cost-interval">Turnus</label>
          <select id="cost-interval" name="interval" defaultValue="MONTHLY">
            <option value="MONTHLY">monatlich</option>
            <option value="YEARLY">jährlich</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full">Hinzufügen</button>
        </div>
      </form>
    </Card>
  );
}
