type Cell = "yes" | "no" | "varies";

type Row = { label: string; tga: Cell; tutoring: Cell; localSchool: Cell };

// Rows are drawn only from things already stated as fact elsewhere on this
// site (full British curriculum to GCSE, live-timetabled lessons, Qur'an/
// Arabic/Islamic Studies on the timetable at every stage, public qualified
// teachers, published fees) — this compares TGA against the two GENERAL
// categories a family choosing between online options would actually be
// weighing, not any named competitor.
const ROWS: Row[] = [
  { label: "Full British curriculum to GCSE", tga: "yes", tutoring: "no", localSchool: "varies" },
  { label: "Qur'an, Arabic & Islamic Studies on the timetable, every stage", tga: "yes", tutoring: "no", localSchool: "varies" },
  { label: "Live, timetabled lessons (not self-paced videos)", tga: "yes", tutoring: "varies", localSchool: "yes" },
  { label: "Qualified UK teachers, public profiles before you apply", tga: "yes", tutoring: "varies", localSchool: "varies" },
  { label: "Attend from anywhere in the world", tga: "yes", tutoring: "varies", localSchool: "no" },
  { label: "Every fee published, no enquiry-only pricing", tga: "yes", tutoring: "varies", localSchool: "varies" },
];

const CELL_STYLE: Record<Cell, { symbol: string; className: string }> = {
  yes: { symbol: "✓", className: "text-teal-700" },
  no: { symbol: "✕", className: "text-ink/30" },
  varies: { symbol: "Varies", className: "text-ink/50 text-xs" },
};

function ScoreCell({ value }: { value: Cell }) {
  const s = CELL_STYLE[value];
  return <td className={`px-4 py-3 text-center font-semibold ${s.className}`}>{s.symbol}</td>;
}

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gold-light/50 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-gold-light/40">
            <th className="px-4 py-3 font-semibold text-ink/70"> </th>
            <th className="px-4 py-3 text-center font-serif text-base font-semibold text-gold-700">TGA</th>
            <th className="px-4 py-3 text-center font-medium text-ink/70">Generic online tutoring</th>
            <th className="px-4 py-3 text-center font-medium text-ink/70">Local Islamic school</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-b border-gold-light/20 last:border-0">
              <td className="px-4 py-3 font-medium text-ink">{r.label}</td>
              <ScoreCell value={r.tga} />
              <ScoreCell value={r.tutoring} />
              <ScoreCell value={r.localSchool} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
