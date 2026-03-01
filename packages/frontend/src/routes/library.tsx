import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useSkills, type Skill } from "../hooks/useSkills";

const PAGE_SIZE = 12;

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  sh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  css: "css",
  html: "html",
  sql: "sql",
};

function inferLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function SkillCard({
  skill,
  onClick,
}: {
  skill: Skill;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card bg-base-100 border border-base-content/10 hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer text-left"
    >
      <div className="card-body p-5 gap-3">
        <h3 className="card-title text-base">{skill.name}</h3>
        {skill.description && (
          <p className="text-sm text-base-content/60 line-clamp-2">
            {skill.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="badge badge-sm badge-ghost font-mono">
            {skill.filename}
          </span>
          <span className="text-xs text-base-content/40">
            {formatRelativeTime(skill.updated_at ?? skill.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}

function SkillCardSkeleton() {
  return (
    <div className="card bg-base-100 border border-base-content/10">
      <div className="card-body p-5 gap-3">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-4/5" />
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

function SkillDetailModal({
  skill,
  onClose,
}: {
  skill: Skill | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (skill) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [skill]);

  if (!skill) return null;

  const language = inferLanguage(skill.filename);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
    >
      <div className="modal-box max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="font-bold text-lg">{skill.name}</h3>
            {skill.description && (
              <p className="text-sm text-base-content/60 mt-1">
                {skill.description}
              </p>
            )}
          </div>
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost">✕</button>
          </form>
        </div>

        <div className="flex items-center gap-3 mb-4 text-xs text-base-content/50">
          <span className="badge badge-sm badge-ghost font-mono">
            {skill.filename}
          </span>
          <span>
            Created {new Date(skill.created_at).toLocaleDateString()}
          </span>
          {skill.updated_at && (
            <span>
              Updated {formatRelativeTime(skill.updated_at)}
            </span>
          )}
        </div>

        <div className="overflow-auto flex-1 rounded-lg">
          <SyntaxHighlighter
            style={oneDark}
            language={language}
            PreTag="div"
            showLineNumbers
            customStyle={{
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              margin: 0,
            }}
          >
            {skill.content}
          </SyntaxHighlighter>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Show at most 5 page buttons centered around the current page
  const maxVisible = 5;
  let start = Math.max(0, page - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible);
  if (end - start < maxVisible) {
    start = Math.max(0, end - maxVisible);
  }

  const pages = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="join">
      <button
        className="join-item btn btn-sm"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        «
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`join-item btn btn-sm ${p === page ? "btn-active" : ""}`}
          onClick={() => onPageChange(p)}
        >
          {p + 1}
        </button>
      ))}
      <button
        className="join-item btn btn-sm"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        »
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-base-content/50">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-16 w-16 mb-4 opacity-30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <p className="text-lg font-medium">No skills yet</p>
      <p className="text-sm mt-1">
        Record browser activity to create your first skill.
      </p>
    </div>
  );
}

export function LibraryPage() {
  const [page, setPage] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const { skills, total, isLoading, error } = useSkills({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Skill Library</h1>
        {!isLoading && total > 0 && (
          <span className="badge badge-primary badge-sm">{total}</span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error mb-6">
          <span>Failed to load skills. Please try again later.</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <SkillCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && skills.length === 0 && <EmptyState />}

      {/* Skill grid */}
      {!isLoading && !error && skills.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => setSelectedSkill(skill)}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center mt-8">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {/* Detail modal */}
      <SkillDetailModal
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}
