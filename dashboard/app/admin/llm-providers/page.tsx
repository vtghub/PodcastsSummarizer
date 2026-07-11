import { redirect } from "next/navigation";
import { getUser, isAdmin } from "@/lib/auth";
import LlmProviderManager from "@/components/LlmProviderManager";

export default async function AdminLlmProvidersPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await isAdmin())) redirect("/dashboard");

  return <LlmProviderManager />;
}
