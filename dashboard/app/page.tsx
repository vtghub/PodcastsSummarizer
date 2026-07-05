import { redirect } from "next/navigation";
import { getAvailableDates } from "@/lib/db";
import { format } from "date-fns";

export default async function Home() {
  let dates: string[] = [];
  try {
    dates = await getAvailableDates();
  } catch {
    // DB not yet initialised — redirect to today anyway
  }

  const target = dates[0] ?? format(new Date(), "yyyy-MM-dd");
  redirect(`/dashboard?date=${target}`);
}
