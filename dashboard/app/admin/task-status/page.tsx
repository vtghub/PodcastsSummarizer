import { redirect } from "next/navigation";
import { getUser, isAdmin } from "@/lib/auth";
import TaskStatusManager from "@/components/TaskStatusManager";

export default async function AdminTaskStatusPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await isAdmin())) redirect("/dashboard");

  return <TaskStatusManager />;
}
