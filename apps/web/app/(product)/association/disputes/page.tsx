"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { orderDisplayRef, statusLabel } from "~~/lib/format";
import type { LotDispute } from "~~/lib/types";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~~/components/ui/tabs";

type ProducerOption = { id: string; name: string; email: string };

function AssociationDisputesInner() {
  const [disputes, setDisputes] = useState<LotDispute[]>([]);
  const [producers, setProducers] = useState<ProducerOption[]>([]);
  const [reassignByDispute, setReassignByDispute] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [disputesRes, producersRes] = await Promise.all([
        apiFetch<{ disputes: LotDispute[] }>("/lot-disputes?status=all"),
        apiFetch<{ producers: ProducerOption[] }>("/users/producers"),
      ]);
      setDisputes(disputesRes.disputes);
      setProducers(producersRes.producers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las disputas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (
    disputeId: string,
    action: "correct_and_resubmit" | "reassign_producer" | "delete_lot" | "acknowledge" | "investigating",
  ) => {
    setBusyId(disputeId);
    setError("");
    try {
      await apiFetch(`/lot-disputes/${disputeId}/resolve`, {
        method: "POST",
        body: {
          action,
          producerId: action === "reassign_producer" ? reassignByDispute[disputeId] : undefined,
          resolutionNote:
            action === "correct_and_resubmit"
              ? "Datos corregidos; se reenvía al productor"
              : action === "delete_lot"
                ? "Lote cancelado por la asociación"
                : action === "acknowledge"
                  ? "Anomalía de integridad reconocida"
                  : action === "investigating"
                    ? "Investigación en curso"
                    : "Lote reasignado a otro productor",
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resolver la disputa");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Skeleton rows={6} />;

  const open = disputes.filter(d => d.status === "open" || d.status === "investigating");
  const resolved = disputes.filter(d => d.status !== "open" && d.status !== "investigating");

  const DisputeCard = ({ dispute }: { dispute: LotDispute }) => {
    const busy = busyId === dispute.id;
    const isOpen = dispute.status === "open" || dispute.status === "investigating";
    const isIntegrity = dispute.reasonCode === "data_mismatch";
    return (
      <Card className={isIntegrity ? "border-destructive/40" : undefined}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-lg">
                <Link href={`/association`} className="hover:underline">
                  Lote {dispute.lotId.slice(0, 8)}
                </Link>
              </CardTitle>
              <CardDescription className="mt-1">
                {dispute.orderExternalRef
                  ? orderDisplayRef(dispute.orderExternalRef, dispute.orderId ?? "")
                  : dispute.orderId
                    ? `Orden ${dispute.orderId.slice(0, 8)}`
                    : "Sin orden"}
                {dispute.producerName ? ` · ${dispute.producerName}` : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill status={dispute.status === "open" ? "open" : dispute.status} />
              {dispute.lotStatus ? <StatusPill status={dispute.lotStatus} /> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{statusLabel(dispute.reasonCode)}</p>
            {dispute.reasonText ? <p className="mt-1 text-muted-foreground">{dispute.reasonText}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Abierta el{" "}
              {new Date(dispute.createdAt).toLocaleString("es-PE", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          {isOpen ? (
            isIntegrity ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-destructive">
                  Anomalía de integridad: los datos del sistema no coinciden. Revisa montos y estado antes de cerrar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void resolve(dispute.id, "investigating")}
                  >
                    Marcar en investigación
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void resolve(dispute.id, "acknowledge")}>
                    Reconocer y cerrar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Puedes corregir y reenviar al mismo productor, reasignar a otro, o cancelar el lote (si aún no tiene
                  inspección).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void resolve(dispute.id, "correct_and_resubmit")}>
                    Corregir y reenviar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void resolve(dispute.id, "delete_lot")}
                  >
                    Cancelar lote
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field>
                    <FieldLabel>Reasignar a otro productor</FieldLabel>
                    <Select
                      value={reassignByDispute[dispute.id] ?? ""}
                      onValueChange={v => setReassignByDispute(prev => ({ ...prev, [dispute.id]: v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Elige productor" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {producers.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !reassignByDispute[dispute.id]}
                    onClick={() => void resolve(dispute.id, "reassign_producer")}
                  >
                    Reasignar
                  </Button>
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Resuelta
              {dispute.resolutionAction ? `: ${statusLabel(dispute.resolutionAction)}` : ""}
              {dispute.resolvedAt ? ` · ${new Date(dispute.resolvedAt).toLocaleDateString("es-PE")}` : ""}
              {dispute.resolutionNote ? ` — ${dispute.resolutionNote}` : ""}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Disputas</h1>
        <p className="text-muted-foreground">
          Declives de productores y anomalías de integridad (cuando los datos del sistema no coinciden) aparecen aquí.
        </p>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Abiertas ({open.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resueltas ({resolved.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-4">
          {!open.length ? (
            <EmptyState title="Sin disputas abiertas" description="Los declives del productor aparecerán aquí." />
          ) : (
            <div className="flex flex-col gap-4">
              {open.map(d => (
                <DisputeCard key={d.id} dispute={d} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="resolved" className="mt-4">
          {!resolved.length ? (
            <EmptyState title="Sin disputas resueltas" description="El historial aparecerá aquí." />
          ) : (
            <div className="flex flex-col gap-4">
              {resolved.map(d => (
                <DisputeCard key={d.id} dispute={d} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AssociationDisputesPage() {
  return (
    <RequireAuth roles={["association", "admin"]}>
      <AssociationDisputesInner />
    </RequireAuth>
  );
}
