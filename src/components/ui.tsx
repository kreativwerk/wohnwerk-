import Link from "next/link";
import type { ReactNode } from "react";

/** Kleine, wiederverwendbare Bausteine – bewusst ohne eigene Zustandslogik. */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="mb-7">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-500">
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-ink-300" aria-hidden="true">›</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="rounded transition-colors hover:text-brand-700"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-ink-600">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.7rem] font-semibold leading-tight text-ink-900">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-relaxed text-ink-500">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200/70 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[0.95rem] font-semibold text-ink-900">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-[0.8rem] text-ink-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200/70",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  warning: "bg-amber-50 text-amber-800 ring-amber-200/70",
  danger: "bg-rose-50 text-rose-700 ring-rose-200/70",
  info: "bg-sky-50 text-sky-700 ring-sky-200/70",
  brand: "bg-brand-100 text-brand-800 ring-brand-300/60",
  accent: "bg-accent-50 text-accent-700 ring-accent-200/70",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[0.15rem] text-[0.72rem] font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  href?: string;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-ink-900",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-rose-600",
    info: "text-sky-600",
    brand: "text-brand-700",
    accent: "text-accent-600",
  };

  const body = (
    <div className={`card h-full px-5 py-[1.15rem] ${href ? "card-link" : ""}`}>
      <p className="text-[0.78rem] font-medium text-ink-500">{label}</p>
      <p className={`mt-2 text-[1.75rem] font-semibold leading-none tabular-nums ${accent[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-[0.78rem] leading-snug text-ink-500">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-6 py-14 text-center">
      <p className="text-[0.95rem] font-medium text-ink-800">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-ink-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

// Tailwind erkennt nur literale Klassennamen, deshalb feste Zuordnung.
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-ink-200 px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500 ${ALIGN[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  return (
    <td className={`border-b border-ink-100 px-4 py-3 align-middle ${ALIGN[align]} ${className}`}>
      {children}
    </td>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** Fortschrittsbalken, z. B. fuer die Auslastung eines Objekts. */
export function Meter({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  const colors: Record<Tone, string> = {
    neutral: "bg-ink-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-sky-500",
    brand: "bg-brand-600",
    accent: "bg-accent-500",
  };
  return (
    <div
      className="h-[0.4rem] w-full overflow-hidden rounded-full bg-ink-200"
      role="img"
      aria-label={`${percent} Prozent`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${colors[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const styles: Record<Tone, string> = {
    neutral: "border-ink-200 bg-ink-50 text-ink-700",
    success: "border-emerald-200/70 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200/70 bg-amber-50 text-amber-900",
    danger: "border-rose-200/70 bg-rose-50 text-rose-800",
    info: "border-sky-200/70 bg-sky-50 text-sky-800",
    brand: "border-brand-300/60 bg-brand-50 text-brand-800",
    accent: "border-accent-200/70 bg-accent-50 text-accent-800",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed ${styles[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

/** Statusbanner aus den Suchparametern (`?ok=` / `?fehler=`). */
export function Flash({ ok, fehler }: { ok?: string; fehler?: string }) {
  if (!ok && !fehler) return null;
  return (
    <div className="mb-5 space-y-2">
      {ok && <Alert tone="success">{ok}</Alert>}
      {fehler && <Alert tone="danger">{fehler}</Alert>}
    </div>
  );
}
