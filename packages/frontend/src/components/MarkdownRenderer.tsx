import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? "");
            const codeString = String(children).replace(/\n$/, "");

            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    borderRadius: "0.5rem",
                    fontSize: "0.8125rem",
                    margin: "0.5rem 0",
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className="bg-base-content/10 px-1.5 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="my-1">{children}</p>;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table className="table table-sm">{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
