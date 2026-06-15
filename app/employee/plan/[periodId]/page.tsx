"use client";
import { use } from "react";
import { trpc } from "@/app/_trpc/client";

export default function MyPlanPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = use(params);
  const plan = trpc.planning.myPlan.useQuery({ periodId });
  return (
    <main style={{ padding: 24 }}>
      <h1>Mein Dienstplan</h1>
      <ul>
        {plan.data?.map((a) => (
          <li key={a.id}>
            {new Date(a.date).toLocaleDateString("de-DE")} — {a.shiftTemplate.name}{" "}
            ({a.shiftTemplate.startTime}–{a.shiftTemplate.endTime})
            {a.breaks.length > 0 && (
              <span> · Pause: {a.breaks.map((b) => `${b.start} (${b.durationMinutes} Min)`).join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
