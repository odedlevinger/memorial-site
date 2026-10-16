import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { move } from '../content';

interface ReorderableProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly labelOf: (item: T) => string;
  readonly render: (item: T, index: number) => ReactNode;
  readonly onReorder: (next: T[]) => void;
  readonly className?: string;
}

/** List reorderable by drag-and-drop (desktop) or ↑ / ↓ buttons (touch, keyboard). */
export function Reorderable<T>({ items, keyOf, labelOf, render, onReorder, className }: ReorderableProps<T>): ReactElement {
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  return (
    <ol className={className}>
      {items.map((item, i) => (
        <li
          key={keyOf(item)}
          draggable
          className={dragFrom === i ? 'dragging' : undefined}
          onDragStart={(): void => setDragFrom(i)}
          onDragEnd={(): void => setDragFrom(null)}
          onDragOver={(e): void => e.preventDefault()}
          onDrop={(e): void => {
            e.preventDefault();
            if (dragFrom !== null && dragFrom !== i) onReorder(move(items, dragFrom, i));
            setDragFrom(null);
          }}
        >
          {render(item, i)}
          <span className="order-buttons">
            <button type="button" disabled={i === 0} onClick={(): void => onReorder(move(items, i, i - 1))} aria-label={`Move ${labelOf(item)} up`}>↑</button>
            <button type="button" disabled={i === items.length - 1} onClick={(): void => onReorder(move(items, i, i + 1))} aria-label={`Move ${labelOf(item)} down`}>↓</button>
          </span>
        </li>
      ))}
    </ol>
  );
}
