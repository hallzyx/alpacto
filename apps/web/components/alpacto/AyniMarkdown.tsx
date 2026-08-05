"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { AyniChatChart, parseAyniChartSpec } from "~~/components/alpacto/AyniChatChart";
import { AyniMermaid } from "~~/components/alpacto/AyniMermaid";
import { cn } from "~~/lib/utils";

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const lang = /language-([\w-]+)/.exec(className ?? "")?.[1] ?? "";
  const raw = String(children ?? "").replace(/\n$/, "");

  if (lang === "mermaid") {
    return <AyniMermaid chart={raw} />;
  }

  if (lang === "ayni-chart" || lang === "chart") {
    const spec = parseAyniChartSpec(raw);
    if (spec) return <AyniChatChart spec={spec} />;
  }

  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 text-xs">
      <code className={className}>{raw}</code>
    </pre>
  );
}

const components: Components = {
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[16rem] border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-100/90">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-slate-200 px-3 py-2 align-top font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-slate-100 px-3 py-2 align-top text-foreground last:border-b-0">{children}</td>
  ),
  tr: ({ children }) => <tr className="even:bg-slate-50/70">{children}</tr>,
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-")) || String(children).includes("\n");
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    return (
      <code className="rounded bg-slate-200/70 px-1 py-0.5 text-[0.85em]" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
};

export function AyniMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "ayni-md text-sm [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_strong]:font-semibold [&_a]:underline",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
