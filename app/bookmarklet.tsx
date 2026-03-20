"use client";

import { useRef, useEffect, useState } from "react";

const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/marks-bookmarks-ai-reader/aedfdmhchamdnnoocknkiiaeacbaffia";

export function Bookmarklet() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [hasExtension, setHasExtension] = useState(false);

  useEffect(() => {
    if ((window as any).__marks_extension) {
      setHasExtension(true);
    }

    if (!linkRef.current) return;
    const origin = window.location.origin;
    linkRef.current.setAttribute(
      "href",
      `javascript:void((function(){var u='${origin}/add?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent(document.getSelection?.()??'');var w=open(u,'Marks','toolbar=no,width=600,height=500');if(!w||w.closed)location.href=u})())`,
    );
  }, []);

  if (hasExtension) return null;

  return (
    <div className="bookmarklet-section">
      <p className="bookmarklet-label">
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Chrome extension
        </a>
        {" · "}
        Drag to your bookmark bar &rarr;{" "}
        <a
          ref={linkRef}
          className="bookmarklet-link"
          href="#"
          onClick={(e) => e.preventDefault()}
          title="Drag this to your bookmark bar"
        >
          + Mark
        </a>
      </p>
    </div>
  );
}
