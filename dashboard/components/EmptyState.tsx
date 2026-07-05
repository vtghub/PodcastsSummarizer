interface Props {
  icon: string;
  title: string;
  message: string;
  hint?: string;
}

export default function EmptyState({ icon, title, message, hint }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--txt-1)" }}>{title}</h2>
      <p className="text-sm max-w-md mb-4" style={{ color: "var(--txt-3)" }}>{message}</p>
      {hint && (
        <code
          className="px-3 py-1.5 rounded-lg text-xs font-mono border"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-2)" }}
        >
          {hint}
        </code>
      )}
    </div>
  );
}
