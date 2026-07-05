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
      <h2 className="text-lg font-semibold text-slate-200 mb-2">{title}</h2>
      <p className="text-slate-400 text-sm max-w-md mb-4">{message}</p>
      {hint && (
        <code className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 font-mono">
          {hint}
        </code>
      )}
    </div>
  );
}
