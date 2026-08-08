"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AyniAuditLiveModal, ErrorBanner, RequireAuth, Skeleton, StatusPill, Timeline } from "~~/components/alpacto";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~~/components/ui/tabs";
import { apiFetch } from "~~/lib/api";
import { formatKg, statusLabel } from "~~/lib/format";
import type { LotTimeline } from "~~/lib/types";

const CATEGORIES = [
  { value: "FINE", label: "FINE" },
  { value: "MEDIUM", label: "MEDIUM" },
  { value: "COARSE", label: "COARSE" },
] as const;

function InspectInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [data, setData] = useState<LotTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [weightGrams, setWeightGrams] = useState("42500");
  const [categoryCode, setCategoryCode] = useState("FINE");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditRunId, setAuditRunId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [submittedWeight, setSubmittedWeight] = useState("42500");
  const [submittedCategory, setSubmittedCategory] = useState("FINE");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const timeline = await apiFetch<LotTimeline>(`/lots/${id}/timeline`);
      setData(timeline);
      const latest = timeline.inspections[timeline.inspections.length - 1];
      if (latest) {
        setWeightGrams(String(latest.weightGrams));
        if (CATEGORIES.some(c => c.value === latest.categoryCode)) setCategoryCode(latest.categoryCode);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar el lote");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const evidenceFileIds: string[] = [];
      if (file) {
        const mimeType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result ?? "");
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
          reader.readAsDataURL(file);
        });

        const upload = await apiFetch<{
          evidenceId: string;
          storageKey: string;
        }>("/evidence/upload", {
          method: "POST",
          body: {
            type: "scale_photo",
            mimeType,
            sizeBytes: String(file.size),
            fileBase64,
          },
        });
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

      setSubmittedWeight(weightGrams);
      setSubmittedCategory(categoryCode);

      try {
        const audit = await apiFetch<{ id: string }>(`/lots/${id}/audits`, { method: "POST", body: {} });
        setAuditRunId(audit.id);
        setAuditOpen(true);
      } catch {
        setNote("Inspección enviada, pero no se pudo encolar Ayni. Revisa el worker.");
        router.push("/inspector");
      }

      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la inspección");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={6} />;
  if (!data) return <ErrorBanner message={loadError || "Lote no encontrado"} />;

  const latestInspection = data.inspections[data.inspections.length - 1];
  const latestAudit = data.audits[0];
  const canInspect = ["registered", "reweighing_requested"].includes(data.lot.status);
  const reweighNote =
    data.lot.status === "reweighing_requested" && data.reweighRequests.length ? data.reweighRequests[0] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Link
            href="/inspector"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Inspecciones
          </Link>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              Lote {id.slice(0, 8)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Registrado el {new Date(data.lot.createdAt).toLocaleDateString("es-PE")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={data.lot.status} />
            {latestAudit ? (
              <Badge variant="outline">Ayni: {statusLabel(latestAudit.resultCode ?? latestAudit.status)}</Badge>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}
      {note ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{note}</p>
          </CardContent>
        </Card>
      ) : null}

      {reweighNote ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-start gap-3 pb-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <CardTitle className="text-base">Nuevo pesaje solicitado</CardTitle>
              <CardDescription>
                {reweighNote.reasonText ?? "El productor pidió que se vuelva a pesar este lote."}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <Tabs defaultValue="inspection" className="w-full">
        <TabsList>
          <TabsTrigger value="inspection">Nueva inspección</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="inspection" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Peso y clasificación</CardTitle>
                <CardDescription>
                  {canInspect
                    ? "Registra el peso real y la categoría. Al enviar, Ayni revisará la evidencia en vivo."
                    : "Este lote no está listo para inspección (falta confirmación del productor o ya fue liquidado)."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4"
                  onSubmit={e => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <Field>
                    <FieldLabel htmlFor="weight">Peso (gramos)</FieldLabel>
                    <Input
                      id="weight"
                      inputMode="numeric"
                      value={weightGrams}
                      onChange={e => setWeightGrams(e.target.value)}
                      required
                      disabled={!canInspect || busy}
                    />
                    {weightGrams ? <p className="text-xs text-muted-foreground">≈ {formatKg(weightGrams)}</p> : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cat">Categoría</FieldLabel>
                    <Select value={categoryCode} onValueChange={setCategoryCode} disabled={!canInspect || busy}>
                      <SelectTrigger id="cat" className="w-full">
                        <SelectValue placeholder="Selecciona categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ev">Evidencia (foto de balanza)</FieldLabel>
                    <Input
                      id="ev"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={e => setFile(e.target.files?.[0] ?? null)}
                      disabled={!canInspect || busy}
                    />
                  </Field>
                  <Button type="submit" disabled={busy || !canInspect}>
                    {busy ? "Enviando…" : "Enviar inspección y abrir Ayni"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Última versión</CardTitle>
                <CardDescription>Versión de inspección vigente</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {latestInspection ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Versión</span>
                      <span className="font-medium">v{latestInspection.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Peso</span>
                      <span className="font-medium">{formatKg(latestInspection.weightGrams)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Categoría</span>
                      <span className="font-medium">{latestInspection.categoryCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estado</span>
                      <StatusPill status={latestInspection.status} />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Sin inspecciones aún.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Línea de tiempo</CardTitle>
              <CardDescription>Eventos, inspecciones y solicitudes de este lote</CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline events={data.events} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {auditRunId ? (
        <AyniAuditLiveModal
          open={auditOpen}
          auditRunId={auditRunId}
          lotId={id}
          declaredWeightGrams={submittedWeight}
          categoryCode={submittedCategory}
          onClose={() => {
            setAuditOpen(false);
            router.push("/inspector");
          }}
        />
      ) : null}
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
