"use client";
import { use } from "react";
import { trpc } from "@/app/_trpc/client";

export default function PlanningBoard({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = use(params);
  const wishes = trpc.planning.wishesForPeriod.useQuery({ periodId });
  const templates = trpc.admin.listTemplates.useQuery();
  // Poll coverage every 5s for the live Soll/Ist view (MVP real-time).
  const coverage = trpc.coverage.forPeriod.useQuery({ periodId }, { refetchInterval: 5000 });
  const assign = trpc.planning.assign.useMutation({ onSuccess: () => coverage.refetch() });
  const planBreaks = trpc.planning.planBreaks.useMutation({ onSuccess: () => coverage.refetch() });
  const publish = trpc.planning.publish.useMutation();

  const hasDeficit = (coverage.data ?? []).some((c) => c.deficit > 0);

  return (
    <main style={{ padding: 24 }}>
      <h1>Planung</h1>

      <h2>Wünsche</h2>
      <ul>
        {wishes.data?.map((w) => (
          <li key={w.id}>
            {w.employee.name} — {new Date(w.date).toLocaleDateString("de-DE")} — {w.shiftTemplate.name}
            <button
              onClick={() =>
                assign.mutate({
                  periodId,
                  employeeId: w.employeeId,
                  date: new Date(w.date).toISOString().slice(0, 10),
                  shiftTemplateId: w.shiftTemplateId,
                  source: "FROM_WISH",
                })
              }
            >
              Übernehmen
            </button>
          </li>
        ))}
      </ul>

      <h2>Coverage (Soll/Ist)</h2>
      <table>
        <thead><tr><th>Datum</th><th>Intervall</th><th>Soll</th><th>Ist</th></tr></thead>
        <tbody>
          {coverage.data?.map((c) => (
            <tr key={`${c.date}-${c.intervalStart}`} style={{ background: c.deficit > 0 ? "#fecaca" : "#bbf7d0" }}>
              <td>{c.date}</td><td>{c.intervalStart}</td><td>{c.required}</td><td>{c.present}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button onClick={() => planBreaks.mutate({ periodId })}>Pausen automatisch planen</button>
      <button
        onClick={() => {
          if (hasDeficit && !confirm("Es gibt Unterdeckung. Trotzdem veröffentlichen?")) return;
          publish.mutate({ periodId, confirmDeficit: hasDeficit });
        }}
      >
        Veröffentlichen
      </button>
      {publish.isSuccess && <p>Periode veröffentlicht.</p>}
    </main>
  );
}
