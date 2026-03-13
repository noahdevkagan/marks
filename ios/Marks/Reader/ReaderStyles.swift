import Foundation

enum ReaderStyles {
    static let css = """
    :root {
        color-scheme: light dark;
    }

    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 19px;
        line-height: 1.9;
        color: #1a1a1a;
        padding: 20px 20px 60px;
        -webkit-font-smoothing: antialiased;
        word-spacing: 0.03em;
        hyphens: auto;
        -webkit-hyphens: auto;
    }

    @media (prefers-color-scheme: dark) {
        body {
            color: #e5e5e5;
            background: #1a1a1a;
        }

        a { color: #4d9fff; }

        pre, code {
            background: #2a2a2a;
        }

        blockquote {
            border-left-color: #444;
        }
    }

    h1 {
        font-family: -apple-system, system-ui, sans-serif;
        font-size: 1.5rem;
        line-height: 1.35;
        letter-spacing: -0.01em;
        margin-bottom: 0.5rem;
    }

    .meta {
        font-family: -apple-system, system-ui, sans-serif;
        font-size: 0.75rem;
        color: #999;
        margin-bottom: 2rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid #e5e5e5;
    }

    @media (prefers-color-scheme: dark) {
        .meta { border-bottom-color: #333; }
    }

    h2, h3, h4 {
        font-family: -apple-system, system-ui, sans-serif;
        margin-top: 2.5em;
        margin-bottom: 1em;
    }

    h2 { font-size: 1.25rem; }
    h3 { font-size: 1.1rem; }

    p {
        margin-bottom: 1.5em;
    }

    a {
        color: #0066cc;
        text-decoration: none;
    }

    img {
        max-width: 100%;
        height: auto;
        border-radius: 6px;
        margin: 1.5em 0;
    }

    figure {
        margin: 1.5em 0;
    }

    figcaption {
        font-size: 0.8rem;
        color: #999;
        text-align: center;
        margin-top: 0.5em;
    }

    blockquote {
        margin: 1.5em 0;
        padding: 0.5em 0 0.5em 1rem;
        border-left: 2px solid #ddd;
        font-style: italic;
    }

    pre {
        background: #f5f5f5;
        padding: 1rem;
        border-radius: 6px;
        overflow-x: auto;
        font-size: 0.8125rem;
        line-height: 1.5;
        margin: 1.5em 0;
    }

    code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.875em;
        background: #f5f5f5;
        padding: 0.15em 0.3em;
        border-radius: 3px;
    }

    pre code {
        background: none;
        padding: 0;
    }

    ul, ol {
        margin: 1.5em 0;
        padding-left: 1.5em;
    }

    li {
        margin-bottom: 0.5em;
    }

    hr {
        border: none;
        border-top: 1px solid #e5e5e5;
        margin: 2em 0;
    }

    @media (prefers-color-scheme: dark) {
        hr { border-top-color: #333; }
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: 1.5em 0;
        font-size: 0.875rem;
    }

    th, td {
        border: 1px solid #e5e5e5;
        padding: 0.5em 0.75em;
        text-align: left;
    }

    @media (prefers-color-scheme: dark) {
        th, td { border-color: #333; }
    }
    """
}
