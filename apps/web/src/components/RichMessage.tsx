import { Fragment, type ReactNode } from "react";

/** A deliberately small, safe Markdown renderer for assistant responses. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.82em]">{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</>;
}

export function RichMessage({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    nodes.push(<ul key={`list-${nodes.length}`} className="my-1 list-disc space-y-1 pl-5">{list.map((item, i) => <li key={i}><Inline text={item} /></li>)}</ul>);
    list = [];
  };
  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { list.push(bullet[1]); return; }
    flushList();
    if (!line.trim()) nodes.push(<div key={`space-${index}`} className="h-2" />);
    else if (line.startsWith("### ")) nodes.push(<h4 key={index} className="mt-1 font-semibold"><Inline text={line.slice(4)} /></h4>);
    else if (line.startsWith("## ") || line.startsWith("# ")) nodes.push(<h3 key={index} className="mt-1 text-base font-semibold"><Inline text={line.replace(/^#{1,2}\s+/, "")} /></h3>);
    else nodes.push(<p key={index}><Inline text={line} /></p>);
  });
  flushList();
  return <div className="space-y-1">{nodes}</div>;
}
