export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="alp-empty">
      <h2 className="alp-empty__title">{title}</h2>
      {description ? <p className="alp-empty__desc">{description}</p> : null}
      {action ? <div className="alp-empty__action">{action}</div> : null}
    </div>
  );
}
