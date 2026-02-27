"use client";

import { useRef, useEffect } from "react";

export function Bookmarklet() {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!linkRef.current) return;
    const origin = window.location.origin;
    // Set href via DOM to bypass React's javascript: URL sanitization
    linkRef.current.setAttribute(
      "href",
      `javascript:void((function(){var u='${origin}/add?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent(document.getSelection?.()??'');var w=open(u,'Marks','toolbar=no,width=600,height=500');if(!w||w.closed)location.href=u})())`,
    );
  }, []);

  return (
    <div className="bookmarklet-section">
      <p className="bookmarklet-label">
        Drag this to your bookmark bar &rarr;{" "}
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
