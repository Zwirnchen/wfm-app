"use client";
import { useEffect, useState } from "react";
import { trpc } from "@/app/_trpc/client";

const defaults = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0.3,
  maxOccupancy: 0.85,
  intervalLengthMinutes: 30 as 15 | 30 | 60,
  openingTime: "08:00",
  closingTime: "18:00",
};

export default function ParametersPage() {
  const existing = trpc.admin.getParams.useQuery();
  const save = trpc.admin.saveParams.useMutation();
  const [form, setForm] = useState(defaults);

  useEffect(() => {
    if (existing.data) {
      setForm({
        serviceLevelTarget: existing.data.serviceLevelTarget,
        thresholdSeconds: existing.data.thresholdSeconds,
        shrinkagePercent: existing.data.shrinkagePercent,
        maxOccupancy: existing.data.maxOccupancy,
        intervalLengthMinutes: existing.data.intervalLengthMinutes as 15 | 30 | 60,
        openingTime: existing.data.openingTime,
        closingTime: existing.data.closingTime,
      });
    }
  }, [existing.data]);

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });

  return (
    <main style={{ padding: 24 }}>
      <h1>Bedarfs-Parameter</h1>
      <label>Service-Level-Ziel (0–1)<input type="number" step="0.01" value={form.serviceLevelTarget} onChange={num("serviceLevelTarget")} /></label>
      <label>Schwelle (Sek.)<input type="number" value={form.thresholdSeconds} onChange={num("thresholdSeconds")} /></label>
      <label>Shrinkage (0–1)<input type="number" step="0.01" value={form.shrinkagePercent} onChange={num("shrinkagePercent")} /></label>
      <label>Max. Occupancy (0–1)<input type="number" step="0.01" value={form.maxOccupancy} onChange={num("maxOccupancy")} /></label>
      <label>Intervalllänge
        <select value={form.intervalLengthMinutes} onChange={(e) => setForm({ ...form, intervalLengthMinutes: Number(e.target.value) as 15 | 30 | 60 })}>
          <option value={15}>15</option><option value={30}>30</option><option value={60}>60</option>
        </select>
      </label>
      <label>Öffnungszeit<input type="time" value={form.openingTime} onChange={(e) => setForm({ ...form, openingTime: e.target.value })} /></label>
      <label>Schließungszeit<input type="time" value={form.closingTime} onChange={(e) => setForm({ ...form, closingTime: e.target.value })} /></label>
      <button disabled={save.isPending} onClick={() => save.mutate(form)}>Speichern</button>
      {save.isSuccess && <p>Gespeichert. Neuer Import wird mit diesen Werten gerechnet.</p>}
      {save.error && <p role="alert" style={{ color: "crimson" }}>{save.error.message}</p>}
    </main>
  );
}
