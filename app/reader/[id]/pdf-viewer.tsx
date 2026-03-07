"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PdfViewerProps {
  pdfUrl: string;
  contentHtml?: string;
}

export function PdfViewer({ pdfUrl, contentHtml }: PdfViewerProps) {
  const [view, setView] = useState<"pages" | "text">(contentHtml ? "pages" : "pages");
  const [numPages, setNumPages] = useState<number>(0);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  return (
    <div className="pdf-viewer">
      {contentHtml && (
        <div className="pdf-view-toggle">
          <button
            className={view === "pages" ? "active" : ""}
            onClick={() => setView("pages")}
          >
            Pages
          </button>
          <button
            className={view === "text" ? "active" : ""}
            onClick={() => setView("text")}
          >
            Text
          </button>
        </div>
      )}

      {view === "pages" ? (
        <div className="pdf-pages">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="pdf-loading">Loading PDF…</div>
            }
            error={
              <div className="pdf-error">
                Could not load PDF.{" "}
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  Open directly &rarr;
                </a>
              </div>
            }
          >
            {numPages > 0 &&
              Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={i + 1}
                  pageNumber={i + 1}
                  width={680}
                  className="pdf-page"
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              ))}
          </Document>
        </div>
      ) : (
        contentHtml && (
          <div
            className="reader-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        )
      )}
    </div>
  );
}
