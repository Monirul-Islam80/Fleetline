"use client";

import { memo, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import { cx } from "@/lib/cx";
import { Icon } from "./Icon";
import { Empty } from "./controls";
import s from "./ui.module.css";

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** CSS grid track, e.g. "90px" or "minmax(160px, 1fr)". */
  width: string;
  align?: "right" | "center";
  render: (row: T) => ReactNode;
  /** Optional per-cell class, e.g. the red overdue time cell. */
  cellClass?: (row: T) => string | undefined;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface DataTableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowAttrs?: (row: T) => HTMLAttributes<HTMLDivElement> & { "data-tone"?: string };
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  /** Fixed row height turns on virtual scrolling for long lists. */
  rowHeight?: number;
  /** Header click sorting; only columns whose key is in `sortable` respond. */
  sort?: SortState;
  sortable?: readonly string[];
  onSort?: (key: string) => void;
  light?: boolean;
  wrap?: boolean;
  className?: string;
}

/** The one table used everywhere: job grid, bookings, drivers, panels. Columns are config, not markup. */
function DataTableInner<T>({ columns, rows, rowKey, rowAttrs, onRowClick, empty = "Nothing to show", rowHeight, sort, sortable, onSort, light, wrap, className }: DataTableProps<T>) {
  const style = { "--cols": columns.map((c) => c.width).join(" ") } as CSSProperties;
  const virtual = useVirtualRows(rowHeight ? rows.length : 0, rowHeight ?? 1);
  const visible = rowHeight ? rows.slice(virtual.start, virtual.end) : rows;

  const renderRow = (row: T, index: number) => {
    const attrs = rowAttrs?.(row) ?? {};
    const top = rowHeight ? (virtual.start + index) * rowHeight : undefined;
    return (
      <div
        key={rowKey(row)}
        role="row"
        {...attrs}
        className={cx(s.tr, rowHeight !== undefined && s.virtualRow, attrs.className)}
        style={{ ...attrs.style, ...(top !== undefined ? { transform: `translateY(${top}px)`, height: rowHeight } : null) }}
        data-clickable={onRowClick ? "" : undefined}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {columns.map((c) => (
          <div key={c.key} role="cell" className={cx(s.td, c.align && s[c.align], c.cellClass?.(row))}>
            {c.render(row)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cx(s.table, light && s.tableLight, wrap && s.wrap, className)} style={style} role="table">
      <div className={s.thead} role="row">
        {columns.map((c) => {
          const canSort = onSort && sortable?.includes(c.key);
          const active = sort?.key === c.key;
          return canSort ? (
            <button key={c.key} type="button" role="columnheader" className={cx(s.th, c.align && s[c.align])} onClick={() => onSort(c.key)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
              {active && <Icon name={sort.dir === "asc" ? "sortUp" : "sortDown"} size={12} />}
              {c.label}
            </button>
          ) : (
            <span key={c.key} role="columnheader" className={cx(s.th, c.align && s[c.align])}>
              {c.label}
            </span>
          );
        })}
      </div>
      <div className={s.tbody} ref={rowHeight ? virtual.viewportRef : undefined} onScroll={rowHeight ? virtual.onScroll : undefined} role="rowgroup">
        {rows.length === 0 ? <Empty>{empty}</Empty> : rowHeight ? <div style={{ height: virtual.totalHeight, position: "relative" }}>{visible.map(renderRow)}</div> : visible.map(renderRow)}
      </div>
    </div>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
