"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ErrorBanner, RequireAuth } from "~~/components/alpacto";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";
import { apiFetch } from "~~/lib/api";

function InspectInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [weightGrams, setWeightGrams] = useState("42500");
  const [categoryCode, setCategoryCode] = useState("FINE");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const evidenceFileIds: string[] = [];
      if (file) {
        const upload = await apiFetch<{
          evidenceId: string;
          uploadUrl: string;
        }>("/evidence/upload-url", {
          method: "POST",
          body: {
            type: "scale_photo",
            mimeType: file.type || "image/jpeg",
            sizeBytes: String(file.size),
          },
        });
        try {
          await fetch(upload.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "image/jpeg" },
          });
        } catch {
          setNote("URL de carga obtenida; subida al storage puede fallar en local — se vincula el evidenceId.");
        }
        evidenceFileIds.push(upload.evidenceId);
      }

      await apiFetch(`/lots/${id}/inspections`, {
        method: "POST",
        body: {
          weightGrams,
          categoryCode,
          evidenceFileIds: evidenceFileIds.length ? evidenceFileIds : undefined,
        },
      });

      // Best-effort enqueue Ayni audit
      try {
        await apiFetch(`/lots/${id}/audits`, { method: "POST", body: {} });
      } catch {
        /* audit optional in UX */
      }

      router.push("/inspector");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la inspección");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="alp-page" style={{ maxWidth: "32rem" }}>
      <div>
        <Link href="/inspector" className="alp-link-btn">
          ← Inspecciones
        </Link>
        <h1 className="alp-title" style={{ marginTop: "0.75rem" }}>
          Inspeccionar lote
        </h1>
        <p className="alp-subtitle">Lote {id.slice(0, 8)}</p>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}
      {note ? <p className="alp-note">{note}</p> : null}

      <form
        className="alp-panel alp-form"
        onSubmit={e => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="alp-field">
          <label htmlFor="weight">Peso (gramos)</label>
          <input
            id="weight"
            inputMode="numeric"
            value={weightGrams}
            onChange={e => setWeightGrams(e.target.value)}
            required
          />
        </div>
        <div className="alp-field">
          <label htmlFor="cat">Categoría</label>
          <Select value={categoryCode} onValueChange={setCategoryCode}>
            <SelectTrigger id="cat" className="w-full">
              <SelectValue placeholder="Selecciona categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FINE">FINE</SelectItem>
              <SelectItem value="MEDIUM">MEDIUM</SelectItem>
              <SelectItem value="COARSE">COARSE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="alp-field">
          <label htmlFor="ev">Evidencia (foto de balanza)</label>
          <input
            id="ev"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <button type="submit" className="alp-btn alp-btn--primary" disabled={busy}>
          {busy ? "Enviando…" : "Enviar inspección"}
        </button>
      </form>
    </div>
  );
}

export default function InspectPage() {
  return (
    <RequireAuth roles={["inspector", "admin"]}>
      <InspectInner />
    </RequireAuth>
  );
}
