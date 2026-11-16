import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders Claude-written markdown. Raw HTML is not rendered. */
export function Markdown({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return (
    <div className="prose-doc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
