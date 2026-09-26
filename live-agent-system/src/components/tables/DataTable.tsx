import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "../../app/admin/components/shared";

export interface Column<T> { key: string; label: ReactNode; render: (record: T) => ReactNode; sortValue?: (record: T) => string | number; className?: string }

export function DataTable<T extends { id: string }>({ data, columns, label, pageSize = 8, emptyAction, compact = false }: { data: T[]; columns: Column<T>[]; label: string; pageSize?: number; emptyAction?: ReactNode; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
  const [requestedPage, setPage] = useState(0);
  const column = columns.find((c) => c.key === sort?.key);
  const sorted = column?.sortValue && sort ? [...data].sort((a, b) => {
    const left = column.sortValue!(a), right = column.sortValue!(b);
    return (typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right))) * sort.direction;
  }) : data;
  const pageCount = Math.ceil(data.length / pageSize);
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const records = sorted.slice(page * pageSize, (page + 1) * pageSize);

  return <><div className="table-scroll"><table className={`admin-table${compact ? " compact" : ""}`} aria-label={label}><thead><tr>{columns.map((col) => <th key={col.key} className={col.className}>{col.sortValue ? <button className="sort-button" onClick={() => { setSort({ key: col.key, direction: sort?.key === col.key && sort.direction === 1 ? -1 : 1 }); setPage(0); }}>{col.label}{sort?.key === col.key ? sort.direction === 1 ? <ArrowUp size={12}/> : <ArrowDown size={12}/> : <ArrowUpDown size={12}/>}</button> : col.label}</th>)}</tr></thead><tbody>{records.map((record) => <tr key={record.id}>{columns.map((col) => <td key={col.key} className={col.className}>{col.render(record)}</td>)}</tr>)}</tbody></table></div>{!data.length && <EmptyState action={emptyAction}/>} {!compact && data.length > 0 && <div className="table-pagination"><span>Showing <strong>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.length)}</strong> of <strong>{data.length}</strong> records</span><div><button className="icon-button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></button><span>{page + 1} / {pageCount}</span><button className="icon-button" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></button></div></div>}</>;
}