export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status} mono`}>
      <span
        className="h-1.5 w-1.5 rounded-full bg-current opacity-80"
        aria-hidden
      />
      {status}
    </span>
  );
}
