"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function HideReadToggle({ hideRead }: { hideRead: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (hideRead) {
      params.delete("hide_read");
    } else {
      params.set("hide_read", "1");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  }

  return (
    <button onClick={toggle} className="hide-read-toggle" title={hideRead ? "Show all bookmarks" : "Hide read bookmarks"}>
      {hideRead ? "show read" : "hide read"}
    </button>
  );
}
