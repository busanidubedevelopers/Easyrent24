export interface LeaseDocumentData {
  title: string;
  sections: { heading: string; paragraphs: string[] }[];
}

/** Renders the exact lease text (the same data the PDF and signatures use). */
export function LeaseDocumentView({ document, className }: { document: LeaseDocumentData; className?: string }) {
  return (
    <article className={className ?? "bg-white dark:bg-slate-950 p-6 md:p-8 rounded-lg border border-border text-sm leading-relaxed max-h-[520px] overflow-y-auto"}>
      <h2 className="font-bold text-base uppercase tracking-wide mb-4">{document.title}</h2>
      {document.sections.map((section) => (
        <section key={section.heading} className="mb-4">
          <h3 className="font-semibold mb-1">{section.heading}</h3>
          {section.paragraphs.map((p, i) => (
            <p key={i} className="mb-2 text-slate-700 dark:text-slate-300 whitespace-pre-line">{p}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
