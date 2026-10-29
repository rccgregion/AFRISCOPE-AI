import {
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Inbox,
  ArrowUpRight,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  Check,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
export function Button({
  children,
  variant = 'primary',
  className = '',
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`btn btn-${variant} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge badge-${tone.toLowerCase()}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function riskTone(r: string) {
  return ['Critical', 'Rejected', 'Failed'].includes(r)
    ? 'red'
    : ['High', 'Elevated', 'Under Review', 'Pending', 'Needs review', 'Deferred'].includes(r)
      ? 'amber'
      : ['Approved', 'Completed', 'Stable', 'Validated', 'Implemented', 'Resolved'].includes(r)
        ? 'green'
        : ['Draft', 'Open', 'Ready', 'Acknowledged'].includes(r)
          ? 'blue'
          : 'neutral';
}
export function Status({ value }: { value: string }) {
  return <Badge tone={riskTone(value)}>{value}</Badge>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  action,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  detail,
  to,
  tone = 'green',
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  to: string;
  tone?: string;
  icon?: ReactNode;
}) {
  return (
    <Link to={to} className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>{icon || <ArrowUpRight size={17} />}</span>
      </div>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </Link>
  );
}
export function Empty({
  title = 'No records yet',
  description = 'Records will appear here when they are available.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success';
}) {
  const Icon = tone === 'warning' ? TriangleAlert : tone === 'success' ? ShieldCheck : Info;
  return (
    <div className={`notice notice-${tone}`}>
      <Icon size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-control" id={id}>
        {children}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          role="tab"
          aria-selected={value === item}
          className={value === item ? 'active' : ''}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
export function Table({
  rows,
  columns,
  pageSize = 10,
  onRowClick,
  label = 'Records',
  empty,
}: {
  rows: Record<string, any>[];
  columns: { key: string; label: string; render?: (r: any) => ReactNode }[];
  pageSize?: number;
  onRowClick?: (r: any) => void;
  label?: string;
  empty?: ReactNode;
}) {
  const [page, setPage] = useState(0),
    [query, setQuery] = useState('');
  const filtered = rows.filter((r) =>
    columns.some((c) =>
      String(r[c.key] ?? '')
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [query, rows.length]);
  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <span>
          {filtered.length} {label.toLowerCase()}
        </span>
        <label className="table-search">
          <Search size={15} />
          <input
            aria-label={`Search ${label}`}
            placeholder="Filter records…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c.key}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(activePage * pageSize, (activePage + 1) * pageSize).map((r, i) => (
              <tr
                key={String(r.id || i)}
                className={onRowClick ? 'clickable' : ''}
                onClick={() => onRowClick?.(r)}
              >
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length &&
        (empty || (
          <Empty
            title="No matching records"
            description="Try another filter or add a record to this workspace."
          />
        ))}
      <div className="pagination">
        <span>
          {filtered.length ? activePage * pageSize + 1 : 0}–
          {Math.min((activePage + 1) * pageSize, filtered.length)} of {filtered.length}
        </span>
        <div>
          <button
            className="icon-btn"
            aria-label="Previous page"
            disabled={activePage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            Page {activePage + 1} of {pages}
          </span>
          <button
            className="icon-btn"
            aria-label="Next page"
            disabled={activePage >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function KeyValue({ data }: { data: Record<string, ReactNode> }) {
  return (
    <dl className="key-values">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Checkline({ children }: { children: ReactNode }) {
  return (
    <div className="checkline">
      <Check size={16} />
      <span>{children}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Loading workspace…</span>
    </div>
  );
}
export function JsonView({ value }: { value: unknown }) {
  return <pre className="json-view">{JSON.stringify(value, null, 2)}</pre>;
}
