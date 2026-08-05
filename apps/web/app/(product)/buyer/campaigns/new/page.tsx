"use client";

import { useRouter } from "next/navigation";
import { CreateCampaignForm, RequireAuth } from "~~/components/alpacto";

function NewCampaignInner() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Nueva campaña</h1>
        <p className="text-muted-foreground">Define el marco comercial para las próximas órdenes.</p>
      </div>
      <CreateCampaignForm
        onCreated={() => {
          router.push("/buyer/campaigns");
        }}
      />
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <NewCampaignInner />
    </RequireAuth>
  );
}
