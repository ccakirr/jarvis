import { Download } from "lucide-react";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Agent indirme linklerini çoğu zaman `kod` olarak yazıyor; onları gerçek linke çeviriyoruz
const DOWNLOAD_PATH = /^\/api\/models\/[0-9a-f]{32}\/(download|report\/download)$/;

function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="md-download" href={href} download>
      <Download size={13} strokeWidth={2.2} />
      {children}
    </a>
  );
}

function downloadLabel(path: string): string {
  return path.endsWith("/report/download") ? "Raporu indir" : "Modeli indir";
}

const components: Components = {
  a: ({ href = "", children }) =>
    href.startsWith("/api/") ? (
      <DownloadLink href={href}>{children}</DownloadLink>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
  code: ({ className, children }) => {
    const text = String(children).trim();
    if (DOWNLOAD_PATH.test(text)) {
      return <DownloadLink href={text}>{downloadLabel(text)}</DownloadLink>;
    }
    return <code className={className}>{children}</code>;
  },
  table: ({ children }) => (
    <div className="md-table">
      <table>{children}</table>
    </div>
  ),
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
