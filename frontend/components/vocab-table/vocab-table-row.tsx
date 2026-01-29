"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { TokenResult } from "@/hooks/use-vocab-filters";
import type { ExampleSentence } from "@/hooks/use-examples";

// JLPT Badge helpers
function getBadgeColor(level: number | null): string {
  switch (level) {
    case 5:
      return "bg-green-50 text-green-700 ring-green-600/20";
    case 4:
      return "bg-blue-50 text-blue-700 ring-blue-600/20";
    case 3:
      return "bg-yellow-50 text-yellow-800 ring-yellow-600/20";
    case 2:
      return "bg-orange-50 text-orange-700 ring-orange-600/20";
    case 1:
      return "bg-red-50 text-red-700 ring-red-600/20";
    default:
      return "bg-gray-50 text-gray-600 ring-gray-500/10";
  }
}

function FrequencyBadge({ rank }: { rank?: number }) {
  if (!rank || rank > 900000) {
    return <span className="text-gray-400 text-xs">-</span>;
  }

  let colorClass = "text-gray-500";
  if (rank <= 1000) colorClass = "text-green-600 font-semibold";
  else if (rank <= 5000) colorClass = "text-blue-600";
  else if (rank <= 10000) colorClass = "text-yellow-600";
  else if (rank <= 20000) colorClass = "text-orange-500";

  return (
    <span className={`text-sm ${colorClass}`}>{rank.toLocaleString()}</span>
  );
}

interface VocabTableRowProps {
  item: TokenResult;
  index: number;
  isSaved: boolean;
  showDate?: boolean;
  showCount?: boolean;
  showActions: boolean;
  isDeleteMode: boolean;
  isExpanded: boolean;
  isLoadingExamples: boolean;
  examples?: ExampleSentence[];
  onToggleExpand: () => void;
  onSave: () => void;
  onDelete: () => void;
  onFetchExamples: () => void;
}

export function VocabTableRow({
  item,
  index,
  isSaved,
  showDate,
  showCount,
  showActions,
  isDeleteMode,
  isExpanded,
  isLoadingExamples,
  examples,
  onToggleExpand,
  onSave,
  onDelete,
  onFetchExamples,
}: VocabTableRowProps) {
  const kanjiRank = item.frequency || 999999;
  const kanaRank = item.kana_freq || 999999;
  const useKanaFreq = kanaRank < kanjiRank;
  const displayRank = useKanaFreq ? item.kana_freq : item.frequency;
  const hasContext = item.context || item.source_history_id;
  const colSpan = (showDate ? 6 : 5) + (showCount ? 1 : 0);

  return (
    <Fragment key={item.id || `${item.base}-${index}`}>
      <tr
        className={`transition-colors ${
          isSaved && !isDeleteMode
            ? "bg-green-50/50 hover:bg-green-50"
            : "hover:bg-gray-50"
        }`}
      >
        {/* Level */}
        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
          <span
            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getBadgeColor(
              item.level,
            )}`}
          >
            {item.level ? `N${item.level}` : "?"}
          </span>
        </td>

        {/* Word */}
        <td className="whitespace-nowrap px-3 py-4">
          <div className="text-lg font-medium text-gray-900">{item.base}</div>
          <div className="text-xs text-gray-500">
            {item.reading || item.surface}
          </div>
        </td>

        {/* Frequency */}
        <td className="whitespace-nowrap px-3 py-4 text-sm group relative">
          <div className="flex items-center gap-1">
            <FrequencyBadge rank={displayRank} />
            {useKanaFreq && (
              <span
                className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1 rounded"
                title="Ranking based on Kana reading"
              >
                kana
              </span>
            )}
          </div>
        </td>

        {/* Count */}
        {showCount && (
          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
            {item.count?.toLocaleString() || "-"}
          </td>
        )}

        {/* Meaning */}
        <td className="px-3 py-4 text-sm text-gray-600">
          <div className="line-clamp-2" title={item.meanings?.join(", ")}>
            {item.meanings?.join("; ") || "-"}
          </div>
        </td>

        {/* Date + Context Toggle */}
        {showDate && (
          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
            <div>
              {item.created_at
                ? new Date(item.created_at).toLocaleDateString()
                : "-"}
            </div>
            {hasContext && (
              <button
                onClick={onToggleExpand}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 flex items-center gap-1 font-medium"
              >
                {isExpanded ? "Hide Context" : "Show Context"}
              </button>
            )}
          </td>
        )}

        {/* Actions */}
        {showActions && (
          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
            {isDeleteMode ? (
              <button
                onClick={onDelete}
                className="text-red-600 hover:text-red-900 hover:bg-red-50 px-3 py-1 rounded transition"
              >
                Delete
              </button>
            ) : (
              <button
                onClick={onSave}
                disabled={isSaved}
                className={`px-3 py-1 rounded transition border ${
                  isSaved
                    ? "text-green-600 bg-green-100 border-green-200 cursor-default"
                    : "text-blue-600 hover:text-blue-900 hover:bg-blue-50 border-blue-200"
                }`}
              >
                {isSaved ? "Saved" : "Save"}
              </button>
            )}
          </td>
        )}
      </tr>

      {/* Context Row */}
      {isExpanded && (
        <tr className="bg-blue-50/50">
          <td
            colSpan={colSpan}
            className="px-6 py-4 text-sm text-gray-700 border-b border-gray-200"
          >
            {/* User Context */}
            {item.context && (
              <div className="flex gap-3 items-start mb-4 pb-4 border-b border-gray-100">
                <span className="font-bold text-blue-400 text-xs uppercase tracking-wide select-none mt-0.5 shrink-0">
                  Source
                </span>
                <div className="text-gray-800">
                  <ContextDisplay
                    context={item.context}
                    historyId={item.source_history_id}
                  />
                </div>
              </div>
            )}

            {/* Examples */}
            <div className="flex gap-3 items-start">
              <span className="font-bold text-purple-500 text-xs uppercase tracking-wide mt-1 w-14 shrink-0">
                Examples
              </span>
              <div className="w-full">
                {!examples && !isLoadingExamples && (
                  <button
                    onClick={onFetchExamples}
                    className="text-xs bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 transition text-gray-600"
                  >
                    Load sentences from Tatoeba
                  </button>
                )}
                {isLoadingExamples && (
                  <span className="text-xs text-gray-400">
                    Loading sentences...
                  </span>
                )}
                {examples && (
                  <div className="grid gap-2">
                    {examples.length === 0 ? (
                      <div className="text-xs text-gray-400 italic">
                        No examples found.
                      </div>
                    ) : (
                      examples.map((ex, i) => (
                        <div
                          key={i}
                          className="text-sm bg-white p-2 rounded border border-gray-100"
                        >
                          <div className="text-gray-900">{ex.jp}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {ex.en}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Context display helper
function ContextDisplay({
  context,
  historyId,
}: {
  context: string;
  historyId?: number;
}) {
  try {
    if (context.trim().startsWith("{")) {
      const data = JSON.parse(context);
      if (data.type === "anime") {
        return (
          <span className="flex items-center gap-1 flex-wrap">
            Saved from
            <Link
              href={`/anime/${data.seriesId}`}
              className="text-blue-600 hover:underline font-medium ml-1"
            >
              {data.seriesTitle || "Anime"}
            </Link>
            {data.episodeNumber && (
              <>
                <span>-</span>
                <Link
                  href={`/anime/episode/${data.episodeId}`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Episode {data.episodeNumber}
                </Link>
              </>
            )}
          </span>
        );
      }
    }
  } catch {
    /* ignore json parse error */
  }

  return (
    <div className="flex gap-3 items-center">
      <span>{context}</span>
      {historyId && (
        <Link
          href={`/history/${historyId}`}
          className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 no-underline"
        >
          View Full Text →
        </Link>
      )}
    </div>
  );
}
