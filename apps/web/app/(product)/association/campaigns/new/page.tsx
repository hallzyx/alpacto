"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { CreateCampaignForm, RequireAuth, Skeleton } from "~~/components/alpacto";

function NewCampaignInner() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Nueva campaña</h1>
        <p className="text-muted-foreground">Define el marco comercial para las próximas órdenes.</p>
      </div>
      <Suspense fallback={<Skeleton rows={4} />}>
        <CreateCampaignForm
          onCreated={() => {
            router.push("/association/campaigns");
          }}
        />
      </Suspense>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <RequireAuth roles={["association", "admin"]}>
      <NewCampaignInner />
    </RequireAuth>
  );
}
