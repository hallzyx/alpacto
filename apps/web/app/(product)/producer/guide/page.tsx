"use client";

import { RequireAuth } from "~~/components/alpacto";
import { ProducerGuide } from "~~/components/alpacto/ProducerGuide";

export default function ProducerGuidePage() {
  return (
    <RequireAuth roles="producer">
      <ProducerGuide />
    </RequireAuth>
  );
}
