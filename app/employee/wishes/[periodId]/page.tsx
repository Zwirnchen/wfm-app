"use client";
import { use, useState } from "react";
import { trpc } from "@/app/_trpc/client";

export default function WishesPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = use(params);
  const templates = trpc.admin.listTemplates.useQuery();
  const upsert = trpc.planning.upsertWish.useMutation();
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [breakPref, setBreakPref] = useState("");

  return (
    <main style={{ padding: 24 }}>
      <h1>Meine Wünsche</h1>
      <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Schicht
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">– wählen –</option>
          {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Pausen-Präferenz (HH:mm, optional)<input value={breakPref} onChange={(e) => setBreakPref(e.target.value)} placeholder="12:00" /></label>
      <button
        disabled={!date || !templateId || upsert.isPending}
        onClick={() =>
          upsert.mutate({
            periodId,
            date,
            shiftTemplateId: templateId,
            breakPreference: breakPref || null,
          })
        }
      >
        Wunsch speichern
      </button>
      {upsert.isSuccess && <p>Wunsch gespeichert.</p>}
      {upsert.error && <p role="alert" style={{ color: "crimson" }}>{upsert.error.message}</p>}
    </main>
  );
}
