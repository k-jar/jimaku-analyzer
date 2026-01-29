"use client";

interface SortIconProps {
  active: boolean;
  order: "asc" | "desc";
}

function SortIcon({ active, order }: SortIconProps) {
  if (!active) return <span className="text-gray-300 ml-1">⇅</span>;
  return (
    <span className="text-blue-600 ml-1">{order === "asc" ? "↑" : "↓"}</span>
  );
}

interface VocabTableHeaderProps {
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  showDate?: boolean;
  showCount?: boolean;
  showActions: boolean;
}

export function VocabTableHeader({
  sortBy,
  sortOrder,
  onSort,
  showDate,
  showCount,
  showActions,
}: VocabTableHeaderProps) {
  const headerClass =
    "px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100";

  return (
    <thead className="bg-gray-50">
      <tr>
        <th
          scope="col"
          className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 cursor-pointer hover:bg-gray-100"
          onClick={() => onSort("level")}
        >
          Level <SortIcon active={sortBy === "level"} order={sortOrder} />
        </th>

        <th scope="col" className={headerClass} onClick={() => onSort("word")}>
          Word <SortIcon active={sortBy === "word"} order={sortOrder} />
        </th>

        <th scope="col" className={headerClass} onClick={() => onSort("freq")}>
          Freq <SortIcon active={sortBy === "freq"} order={sortOrder} />
        </th>

        {showCount && (
          <th
            scope="col"
            className={headerClass}
            onClick={() => onSort("count")}
          >
            Count <SortIcon active={sortBy === "count"} order={sortOrder} />
          </th>
        )}

        <th
          scope="col"
          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-1/3"
        >
          Meaning
        </th>

        {showDate && (
          <th
            scope="col"
            className={headerClass}
            onClick={() => onSort("date")}
          >
            Added <SortIcon active={sortBy === "date"} order={sortOrder} />
          </th>
        )}

        {showActions && (
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
            <span className="sr-only">Actions</span>
          </th>
        )}
      </tr>
    </thead>
  );
}
