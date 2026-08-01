export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="dot" style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", boxShadow: "0 0 8px currentColor" }} />
      {status}
    </span>
  );
}
