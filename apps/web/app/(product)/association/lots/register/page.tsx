"use client";

import { useRouter } from "next/navigation";
import { RegisterLotForm, RequireAuth } from "~~/components/alpacto";

function RegisterLotInner() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Registrar lote</h1>
        <p className="text-muted-foreground">Vincula fibra de un productor a una orden fondeada.</p>
      </div>
      <RegisterLotForm
        onRegistered={() => {
          router.push("/association");
        }}
      />
    </div>
  );
}

export default function RegisterLotPage() {
  return (
    <RequireAuth roles={["association", "admin"]}>
      <RegisterLotInner />
    </RequireAuth>
  );
}
