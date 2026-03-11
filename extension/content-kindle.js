// Runs on read.amazon.com/notebook — scrapes Kindle highlights when triggered
(async function () {
  const response = await chrome.runtime.sendMessage({ type: "kindle-check-scrape" });
  if (!response || !response.shouldScrape) return;

  // Build lookup of existing books for incremental sync
  const existingByAsin = {};
  if (response.existingBooks) {
    response.existingBooks.forEach((b) => { existingByAsin[b.asin] = b.highlightCount; });
  }

  const initialBooks = await waitForBooks();
  if (!initialBooks || initialBooks.length === 0) {
    chrome.runtime.sendMessage({ type: "kindle-scrape-error", error: "No books found. Make sure you have Kindle highlights." });
    return;
  }

  showProgress("Loading all books...");
  await loadAllBooks();

  const bookEls = document.querySelectorAll(".kp-notebook-library-each-book");

  const meta = Array.from(bookEls).map((el) => {
    const img = el.querySelector(".kp-notebook-cover-image");
    let cover = img ? img.src : null;
    if (cover) cover = cover.replace(/_SY\d+/, "_SY400");
    // Amazon shows highlight count in the library list
    const countEl = el.querySelector(".kp-notebook-highlight-count");
    const countText = countEl ? countEl.textContent : "";
    const countMatch = countText.match(/(\d+)/);
    const highlightCount = countMatch ? parseInt(countMatch[1]) : -1;
    return {
      asin: el.id,
      title: (el.querySelector("h2") || {}).textContent?.trim() || "Unknown",
      author: (el.querySelector("p") || {}).textContent?.replace(/^By:\s*/, "").trim() || "Unknown",
      cover,
      highlightCount,
    };
  });

  // Filter to only books that are new or have changed highlight counts
  const toFetch = meta.filter((bk) => {
    if (!(bk.asin in existingByAsin)) return true; // new book
    if (bk.highlightCount === -1) return true; // can't determine count, re-fetch
    return bk.highlightCount !== existingByAsin[bk.asin]; // count changed
  });

  const skipped = meta.length - toFetch.length;
  if (toFetch.length === 0) {
    showProgress("Already up to date!");
    chrome.runtime.sendMessage({ type: "kindle-scrape-progress", message: "Already up to date!" });
    await sleep(500);
    await chrome.runtime.sendMessage({
      type: "kindle-scrape-complete",
      payload: { exportedAt: new Date().toISOString(), books: [] },
    });
    return;
  }

  const label = skipped > 0 ? `Syncing ${toFetch.length} updated books (${skipped} unchanged)...` : `Syncing ${toFetch.length} books...`;
  showProgress(label);

  const BATCH = 8;
  const books = [];

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((bk) =>
        fetch(`/notebook?asin=${bk.asin}&contentLimitState=`, { credentials: "include" })
          .then((r) => r.text())
          .then((html) => ({ book: bk, html }))
          .catch(() => ({ book: bk, html: "" }))
      )
    );

    results.forEach((r) => {
      books.push({
        asin: r.book.asin,
        title: r.book.title,
        author: r.book.author,
        cover: r.book.cover,
        highlights: parseHighlights(r.html),
      });
    });

    const done = Math.min(i + BATCH, toFetch.length);
    updateProgress(done, toFetch.length);
    const msg = skipped > 0
      ? `Syncing ${done}/${toFetch.length} updated books (${skipped} unchanged)...`
      : `Syncing ${done}/${toFetch.length} books...`;
    chrome.runtime.sendMessage({ type: "kindle-scrape-progress", message: msg });

    if (i + BATCH < toFetch.length) await sleep(200);
  }

  await chrome.runtime.sendMessage({
    type: "kindle-scrape-complete",
    payload: { exportedAt: new Date().toISOString(), books },
  });
})();

// --- Helpers ---

function parseHighlights(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const highlights = [];
  for (const row of doc.querySelectorAll(".a-row.a-spacing-base")) {
    const he = row.querySelector("#highlight");
    const hd = row.querySelector("#annotationHighlightHeader");
    const ne = row.querySelector("#note");
    const hv = row.querySelector(".kp-notebook-highlight");
    if (!he || !he.textContent.trim()) continue;
    let color = "unknown";
    if (hv) {
      if (hv.classList.contains("kp-notebook-highlight-yellow")) color = "yellow";
      else if (hv.classList.contains("kp-notebook-highlight-blue")) color = "blue";
      else if (hv.classList.contains("kp-notebook-highlight-pink")) color = "pink";
      else if (hv.classList.contains("kp-notebook-highlight-orange")) color = "orange";
    }
    const lm = hd ? hd.textContent.match(/Location:\s*([\d,]+)/) : null;
    const pm = hd ? hd.textContent.match(/Page:\s*([\d,]+)/) : null;
    highlights.push({
      text: he.textContent.trim(),
      color,
      location: lm ? parseInt(lm[1].replace(",", "")) : null,
      page: pm ? parseInt(pm[1].replace(",", "")) : null,
      note: ne && ne.textContent.trim() ? ne.textContent.trim() : null,
    });
  }
  return highlights;
}

async function loadAllBooks() {
  let lastCount = 0;
  let stableRounds = 0;

  for (let i = 0; i < 100; i++) {
    const books = document.querySelectorAll(".kp-notebook-library-each-book");
    const count = books.length;

    if (count === lastCount) {
      stableRounds++;
      if (stableRounds >= 3) break;
    } else {
      stableRounds = 0;
      const t = document.getElementById("m-text");
      if (t) t.textContent = `Loading books... (${count} found)`;
    }
    lastCount = count;

    const lastBook = books[books.length - 1];
    if (lastBook) lastBook.scrollIntoView({ behavior: "instant", block: "end" });

    const library = document.querySelector(".kp-notebook-library");
    if (library) library.scrollTop = library.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);

    await sleep(800);
  }

  window.scrollTo(0, 0);
}

function waitForBooks(timeout = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      const els = document.querySelectorAll(".kp-notebook-library-each-book");
      if (els.length > 0) return resolve(els);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 1000);
    })();
  });
}

function showProgress(msg) {
  const s = document.createElement("div");
  s.id = "m-status";
  s.style.cssText = "position:fixed;top:12px;right:12px;background:#232f3e;color:#ff9900;padding:16px 24px;border-radius:10px;z-index:99999;font:14px/1.4 -apple-system,sans-serif;min-width:260px;box-shadow:0 4px 20px rgba(0,0,0,0.3);";
  s.innerHTML = `<div id="m-text" style="margin-bottom:8px">${msg}</div><div style="background:#37475a;border-radius:4px;height:6px;overflow:hidden"><div id="m-bar" style="background:#ff9900;height:100%;border-radius:4px;width:0%;transition:width 0.3s"></div></div>`;
  document.body.appendChild(s);
}

function updateProgress(done, total) {
  const t = document.getElementById("m-text");
  const b = document.getElementById("m-bar");
  if (t) t.textContent = `Syncing ${done}/${total} books...`;
  if (b) b.style.width = Math.round((done / total) * 100) + "%";
  if (done === total && t) {
    t.textContent = `Done! ${total} books synced.`;
    setTimeout(() => { const el = document.getElementById("m-status"); if (el) el.remove(); }, 2000);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
