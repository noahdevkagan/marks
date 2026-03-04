"use client";

import { useState, useEffect } from "react";

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Don't show if dismissed recently
    const dismissed = localStorage.getItem("install-prompt-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !("MSStream" in window);
    setIsIOS(ios);

    // On Android Chrome, listen for the install prompt
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // On iOS, show a manual instruction
    if (ios) {
      setShow(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  function dismiss() {
    localStorage.setItem("install-prompt-dismissed", String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="install-prompt">
      {isIOS ? (
        <p>
          To share links to Marks, tap{" "}
          <strong>
            Share <span aria-label="share icon">&#xFEFF;↑</span>
          </strong>{" "}
          then <strong>Add to Home Screen</strong>.
        </p>
      ) : (
        <p>
          Install Marks to share links directly from any app.
        </p>
      )}
      <div className="install-prompt-actions">
        {!isIOS && (
          <button className="install-prompt-btn" onClick={install}>
            Install
          </button>
        )}
        <button className="install-prompt-dismiss" onClick={dismiss}>
          dismiss
        </button>
      </div>
    </div>
  );
}
