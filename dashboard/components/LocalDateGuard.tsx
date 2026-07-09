"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Runs once on the client. If the browser's local date differs from the date
 * the server rendered (e.g. user is in EST and UTC has already flipped to the
 * next day), silently navigates to the correct local date.
 *
 * Only active when no explicit ?date= param was in the URL (serverDate was the
 * server's "today" guess). Once the user navigates to a specific date this
 * component is unmounted so it never overrides an intentional selection.
 */
export default function LocalDateGuard({ serverDate }: { serverDate: string }) {
  const router = useRouter();

  useEffect(() => {
    const localDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
    if (localDate !== serverDate) {
      router.replace(`/dashboard?date=${localDate}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
