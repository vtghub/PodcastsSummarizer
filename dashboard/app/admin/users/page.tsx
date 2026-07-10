import { redirect } from "next/navigation";
import { getUser, isAdmin } from "@/lib/auth";
import AdminUsersManager from "@/components/AdminUsersManager";

export default async function AdminUsersPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await isAdmin())) redirect("/dashboard");

  return <AdminUsersManager currentUserId={user.id} />;
}
