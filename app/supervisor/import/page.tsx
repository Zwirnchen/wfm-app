"use client";
import { useState } from "react";
import { trpc } from "@/app/_trpc/client";

export default function ImportPage() {
  const [preview, setPreview] = useState<{
    points: { date: string; intervalStart: string; expectedCalls: number; ahtSeconds: number }[];
    errors: { line: number; reason: string }[];
  } | null>(null);
  const [fileName, setFileName] = useState("");
  const previewMut = trpc.forecast.preview.useMutation({ onSuccess: setPreview });
  const commitMut = trpc.forecast.commit.useMutation();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const kind = file.name.endsWith(".csv") ? "csv" : "xlsx";
    previewMut.mutate({ fileName: file.name, base64, kind });
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Telefonie-Import</h1>
      <input type="file" accept=".csv,.xlsx" onChange={onFile} />
      {preview && (
        <section>
          <p>
            {preview.points.length} gültige Intervalle, {preview.errors.length} Fehler.
          </p>
          {preview.errors.length > 0 && (
            <ul>
              {preview.errors.map((e) => (
                <li key={e.line}>Zeile {e.line}: {e.reason}</li>
              ))}
            </ul>
          )}
          <button
            disabled={preview.points.length === 0 || commitMut.isPending}
            onClick={() => commitMut.mutate({ fileName, points: preview.points })}
          >
            Import bestätigen & Bedarf berechnen
          </button>
          {commitMut.isSuccess && <p>Importiert: {commitMut.data.intervals} Intervalle.</p>}
        </section>
      )}
    </main>
  );
}
