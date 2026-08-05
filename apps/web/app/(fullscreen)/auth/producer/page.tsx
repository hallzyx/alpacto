import { AuthSplitLayout } from "~~/components/alpacto/AuthSplitLayout";
import { ProducerLoginForm } from "~~/components/alpacto/ProducerLoginForm";

export default function ProducerAuthPage() {
  return (
    <AuthSplitLayout contentMaxWidth="md">
      <ProducerLoginForm className="w-full" />
    </AuthSplitLayout>
  );
}
