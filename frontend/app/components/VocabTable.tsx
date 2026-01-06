"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { FrequencyBadge, getBadgeColor } from "./BadgeHelpers";
import {
  generateAnkiCSV,
  generatePlainText,
  downloadFile,
} from "@/utils/csvExport";
import Cookies from "js-cookie";
import ConfirmationDialog from "./ConfirmationDialog";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Represents a vocabulary token or word entry displayed in the table.
 * Can represent an analysis result, a saved word, or a dictionary entry.
 */
interface TokenResult {
  surface: string;
  base: string;
  id?: number;
  level: number | null;
  reading?: string;
  meanings?: string[];
  frequency?: number;
  kana_freq?: number;
  pos?: string[];
  created_at?: string;
  context?: string;
  source_history_id?: number;
  count?: number;
}

/**
 * Props for the VocabTable component.
 */
interface VocabTableProps {
  /** List of tokens to display. */
  tokens: TokenResult[];
  /** Callback when a word is saved. */
  onSave?: (word: string) => void;
  /** Callback when a word is deleted (single). */
  onDelete?: (word: string) => void;
  /** Callback when multiple words are deleted. */
  onBulkDelete?: (words: string[]) => Promise<void>;
  /** Label for the context column (e.g. "Text Analysis", "Dictionary"). */
  contextLabel?: string;
  /** Whether to show the "Added" date column. */
  showDate?: boolean;
  /** Whether to show the occurrence count column. */
  showCount?: boolean;
  /** If true, pagination and filtering are handled by the parent via onParamsChange. */
  serverSide?: boolean;
  /** Total number of items (required if serverSide is true). */
  totalItems?: number;
  /** Callback for server-side parameter changes. */
  onParamsChange?: (params: {
    page: number;
    itemsPerPage: number;
    search: string;
    level: string;
    minFreq: number | "";
    maxFreq: number | "";
    hideSaved: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) => void;
  initialMinFreq?: number | "";
  initialMaxFreq?: number | "";
  /** Callback to fetch words for bulk save (server-side mode). */
  onPrepareBulkSave?: () => Promise<string[]>;
  /** Callback to execute bulk save (server-side mode). */
  onExecuteBulkSave?: (words: string[]) => Promise<void>;
  /** Callback to handle bulk export (server-side mode). */
  onBulkExport?: (type: "csv" | "txt") => Promise<void>;
}

// Helper for Sort Icons
const SortIcon = ({
  active,
  order,
}: {
  active: boolean;
  order: "asc" | "desc";
}) => {
  if (!active) return <span className="text-gray-300 ml-1">⇅</span>;
  return (
    <span className="text-blue-600 ml-1">{order === "asc" ? "↑" : "↓"}</span>
  );
};

/**
 * VocabTable Component.
 * A comprehensive table for displaying, filtering, sorting, and managing vocabulary.
 * Supports both client-side and server-side data handling.
 */
export default function VocabTable({
  tokens,
  onSave,
  onDelete,
  onBulkDelete,
  contextLabel,
  showDate,
  showCount,
  serverSide,
  totalItems,
  onParamsChange,
  initialMinFreq = 0,
  initialMaxFreq = 100000,
  onPrepareBulkSave,
  onExecuteBulkSave,
  onBulkExport,
}: VocabTableProps) {
  // --- CONSTANTS ---
  const BULK_LIMIT = 5000;
  const ITEMS_PER_PAGE = 50;

  // --- FILTER & SORT STATE ---
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("count");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [hideSaved, setHideSaved] = useState(false);
  const [minFreq, setMinFreq] = useState<number | "">(initialMinFreq);
  const [maxFreq, setMaxFreq] = useState<number | "">(initialMaxFreq);

  // --- UI STATE ---
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isLevelOpen, setIsLevelOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // --- DATA STATE ---
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [wordsToSave, setWordsToSave] = useState<string[]>([]);
  const [wordsToDelete, setWordsToDelete] = useState<string[]>([]);
  const [examplesMap, setExamplesMap] = useState<
    Record<string, { jp: string; en: string }[]>
  >({});
  const [loadingExamples, setLoadingExamples] = useState<Set<string>>(
    new Set()
  );

  // --- PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);

  // Check login status and fetch saved words on mount
  useEffect(() => {
    const token = Cookies.get("token");
    if (token) {
      setIsLoggedIn(true);
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/words/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: string[]) => setSavedWords(new Set(data)))
        .catch((err) => console.error(err));
    }
  }, []);

  // Handle server-side parameter changes with debounce
  useEffect(() => {
    if (serverSide && onParamsChange) {
      const timeoutId = setTimeout(() => {
        onParamsChange({
          page: currentPage,
          itemsPerPage: ITEMS_PER_PAGE,
          search: searchQuery,
          level: selectedLevel,
          minFreq,
          maxFreq,
          sortBy,
          sortOrder,
          hideSaved,
        });
      }, 600); // Debounce
      return () => clearTimeout(timeoutId);
    }
  }, [
    serverSide,
    currentPage,
    searchQuery,
    selectedLevel,
    minFreq,
    maxFreq,
    sortBy,
    sortOrder,
    hideSaved,
  ]);

  // --- FILTERING & SORTING LOGIC (Client-Side) ---
  const processedTokens = useMemo(() => {
    if (serverSide) {
      // In server-side mode skip local filtering/sorting, already done by backend
      return tokens;
    }

    let result = [...tokens];

    // Filter by Level
    if (selectedLevel) {
      result = result.filter((t) => t.level === parseInt(selectedLevel));
    }

    // Filter Saved
    if (hideSaved) {
      result = result.filter((t) => !savedWords.has(t.base));
    }

    // Filter Frequency
    result = result.filter((t) => {
      const rank =
        t.kana_freq && t.kana_freq < (t.frequency || 999999)
          ? t.kana_freq
          : t.frequency;
      const hasRank = rank && rank < 900000;

      if (minFreq !== "" && hasRank && rank < minFreq) return false;
      if (maxFreq !== "") {
        if (!hasRank) return false;
        if (rank > maxFreq) return false;
      }
      return true;
    });

    // Filter by Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.base.includes(q) ||
          (t.reading && t.reading.includes(q)) ||
          (t.meanings &&
            t.meanings.some((m: string) => m.toLowerCase().includes(q)))
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortBy) {
        case "level":
          // Handle nulls (unknown level)
          valA = a.level || 99;
          valB = b.level || 99;
          break;
        case "freq":
          const freqA = a.frequency || 999999;
          const kanaA = a.kana_freq || 999999;
          valA = Math.min(freqA, kanaA);

          const freqB = b.frequency || 999999;
          const kanaB = b.kana_freq || 999999;
          valB = Math.min(freqB, kanaB);
          break;
        case "word":
          valA = a.base;
          valB = b.base;
          break;
        case "date":
          valA = a.created_at || "";
          valB = b.created_at || "";
          break;
        case "count":
          valA = a.count || 0;
          valB = b.count || 0;
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    selectedLevel,
    searchQuery,
    sortBy,
    sortOrder,
    minFreq,
    maxFreq,
    hideSaved,
    savedWords,
    serverSide,
    tokens,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedLevel,
    searchQuery,
    sortBy,
    sortOrder,
    minFreq,
    maxFreq,
    hideSaved,
  ]);

  // Ensure current page is valid if list shrinks
  useEffect(() => {
    const total = serverSide ? totalItems || 0 : processedTokens.length;
    const maxPage = Math.ceil(total / ITEMS_PER_PAGE) || 1;
    if (!serverSide && currentPage > maxPage) setCurrentPage(maxPage);
  }, [processedTokens.length]);

  // Handle Header Click
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  // --- ACTION HANDLERS ---

  const handleSaveClick = (word: string) => {
    if (onSave) onSave(word);
    setSavedWords((prev) => new Set(prev).add(word));
  };

  const handleDeleteClick = (word: string) => {
    if (onDelete) onDelete(word);
  };

  // Prepares bulk save operation
  const handleSaveAllClick = async () => {
    if (!isLoggedIn) return;

    let toSave: string[] = [];

    if (onPrepareBulkSave) {
      // Server-side: Fetch words first
      const toastId = toast.loading("Fetching words...");
      try {
        toSave = await onPrepareBulkSave();
        toast.dismiss(toastId);
      } catch (e) {
        toast.error("Failed to prepare save", { id: toastId });
        return;
      }
    } else {
      // Client-side: Use current filtered list
      toSave = processedTokens
        .filter((t) => !savedWords.has(t.base))
        .map((t) => t.base);
    }

    if (toSave.length === 0) {
      toast.error("No new words to save");
      return;
    }

    // Apply Limit
    if (toSave.length > BULK_LIMIT) {
      toSave = toSave.slice(0, BULK_LIMIT);
    }

    setWordsToSave(toSave);
    setIsConfirmOpen(true);
  };

  // Executes bulk save operation
  const executeSaveAll = async () => {
    if (onExecuteBulkSave) {
      // Server-side execution
      await onExecuteBulkSave(wordsToSave);

      // Optimistically update local saved words
      setSavedWords((prev) => {
        const next = new Set(prev);
        wordsToSave.forEach((w) => next.add(w));
        return next;
      });

      setIsConfirmOpen(false);
      setWordsToSave([]);
      return;
    }

    // Client-side execution
    const token = Cookies.get("token");
    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/words/save/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ words: wordsToSave }),
        }
      );
      if (res.ok) {
        setSavedWords((prev) => {
          const next = new Set(prev);
          wordsToSave.forEach((w) => next.add(w));
          return next;
        });
        toast.success(`Saved ${wordsToSave.length} words.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save words");
    } finally {
      setIsConfirmOpen(false);
      setWordsToSave([]);
    }
  };

  const handleDeleteAllClick = () => {
    const toDelete = processedTokens.map((t) => t.base);
    if (toDelete.length === 0) {
      toast.error("No words to delete");
      return;
    }
    setWordsToDelete(toDelete);
    setIsDeleteConfirmOpen(true);
  };

  const executeDeleteAll = async () => {
    if (onBulkDelete) {
      await onBulkDelete(wordsToDelete);
      setIsDeleteConfirmOpen(false);
      setWordsToDelete([]);
    }
  };

  // Handles export to CSV or TXT
  const handleExport = async (type: "csv" | "txt") => {
    if (onBulkExport) {
      await onBulkExport(type);
      setIsExportOpen(false);
      return;
    }

    const exportData = processedTokens.map((t) => ({
      word: t.base,
      reading: t.reading || "",
      meanings: t.meanings || [],
      level: t.level,
      context: contextLabel,
    }));

    if (type === "csv") {
      const content = generateAnkiCSV(exportData);
      downloadFile(content, "vocab_export.csv", "text/csv;charset=utf-8;");
    } else {
      const content = generatePlainText(exportData);
      downloadFile(content, "vocab_export.txt", "text/plain;charset=utf-8;");
    }
    setIsExportOpen(false);
  };

  const toggleRow = (word: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(word)) newSet.delete(word);
    else newSet.add(word);
    setExpandedRows(newSet);
  };

  // Fetches example sentences from backend
  const fetchExamples = async (word: string) => {
    if (examplesMap[word]) return;
    setLoadingExamples((prev) => new Set(prev).add(word));
    const token = Cookies.get("token");

    try {
      const res = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL
        }/words/examples?word=${encodeURIComponent(word)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const data = await res.json();
      setExamplesMap((prev) => ({ ...prev, [word]: data.sentences }));
    } catch (err) {
      console.error(err);
      toast.error("Could not load examples");
    } finally {
      setLoadingExamples((prev) => {
        const newSet = new Set(prev);
        newSet.delete(word);
        return newSet;
      });
    }
  };

  // Renders the context column content
  const renderContext = (context: string, historyId?: number) => {
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
    } catch (e) {
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
  };

  // Pagination Slicing
  // If serverSide, 'processedTokens' is already just the current page
  // If client-side, 'processedTokens' is the full list, so slice it
  const paginatedTokens = serverSide
    ? processedTokens
    : processedTokens.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      );

  const totalPages =
    Math.ceil(
      (serverSide ? totalItems || 0 : processedTokens.length) / ITEMS_PER_PAGE
    ) || 1;

  if (!serverSide && tokens.length === 0) return null;

  return (
    <div className="mt-2">
      {/* TOOLBAR */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 gap-4">
        <div className="text-gray-500 font-medium">
          {serverSide ? totalItems : processedTokens.length} words
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            className="border border-gray-300 rounded px-3 py-1 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Frequency Range */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-2 py-1">
            <span className="text-xs text-gray-500">Freq:</span>
            <input
              type="number"
              placeholder="Min"
              className="w-16 text-sm text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={minFreq}
              onChange={(e) =>
                setMinFreq(e.target.value ? Number(e.target.value) : "")
              }
            />
            <span className="text-gray-400">-</span>
            <input
              type="number"
              placeholder="Max"
              className="w-16 text-sm text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={maxFreq}
              onChange={(e) =>
                setMaxFreq(e.target.value ? Number(e.target.value) : "")
              }
            />
          </div>

          {/* Hide Saved */}
          {isLoggedIn && onSave && (
            <label className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={hideSaved}
                onChange={(e) => setHideSaved(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              Hide Saved
            </label>
          )}

          {/* Level Filter */}
          <div className="relative">
            {isLevelOpen && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsLevelOpen(false)}
              ></div>
            )}
            <button
              onClick={() => setIsLevelOpen(!isLevelOpen)}
              className="border border-gray-300 rounded px-3 py-1 text-sm bg-white hover:bg-gray-50 flex items-center gap-1 min-w-[100px] justify-between"
            >
              {selectedLevel ? `N${selectedLevel}` : "All Levels"}{" "}
              <span className="text-xs">▼</span>
            </button>

            {isLevelOpen && (
              <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-20 py-1">
                <button
                  onClick={() => {
                    setSelectedLevel("");
                    setIsLevelOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  All Levels
                </button>
                {[5, 4, 3, 2, 1].map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      setSelectedLevel(level.toString());
                      setIsLevelOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    N{level}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            {isExportOpen && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsExportOpen(false)}
              ></div>
            )}
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="border border-gray-300 rounded px-3 py-1 text-sm bg-white hover:bg-gray-50 flex items-center gap-1"
            >
              Export <span className="text-xs">▼</span>
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-20 py-1">
                <button
                  onClick={() => handleExport("csv")}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Anki CSV
                </button>
                <button
                  onClick={() => handleExport("txt")}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Plain Text
                </button>
              </div>
            )}
          </div>

          {/* Save All Button */}
          {isLoggedIn && onSave && (
            <button
              onClick={handleSaveAllClick}
              className="border border-blue-300 text-blue-700 rounded px-3 py-1 text-sm bg-blue-50 hover:bg-blue-100 transition-colors"
              title="Save all words matching current filters"
            >
              Save All
            </button>
          )}

          {/* Delete All Button */}
          {onBulkDelete && processedTokens.length > 0 && (
            <button
              onClick={handleDeleteAllClick}
              className="border border-red-300 text-red-700 rounded px-3 py-1 text-sm bg-red-50 hover:bg-red-100 transition-colors"
              title="Delete all words matching current filters"
            >
              Delete All
            </button>
          )}
        </div>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("level")}
              >
                Level <SortIcon active={sortBy === "level"} order={sortOrder} />
              </th>

              <th
                scope="col"
                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("word")}
              >
                Word <SortIcon active={sortBy === "word"} order={sortOrder} />
              </th>

              <th
                scope="col"
                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("freq")}
              >
                Freq <SortIcon active={sortBy === "freq"} order={sortOrder} />
              </th>

              {showCount && (
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("count")}
                >
                  Count{" "}
                  <SortIcon active={sortBy === "count"} order={sortOrder} />
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
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("date")}
                >
                  Added{" "}
                  <SortIcon active={sortBy === "date"} order={sortOrder} />
                </th>
              )}

              {(isLoggedIn || onDelete) && (
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {paginatedTokens.length === 0 ? (
              <tr>
                <td
                  colSpan={(showDate ? 6 : 5) + (showCount ? 1 : 0)}
                  className="text-center py-8 text-gray-500"
                >
                  No words match your filters.
                </td>
              </tr>
            ) : (
              paginatedTokens.map((item, index) => {
                // If kana freq exists and is better (lower) than Kanji freq, use it.
                const kanjiRank = item.frequency || 999999;
                const kanaRank = item.kana_freq || 999999;

                const useKanaFreq = kanaRank < kanjiRank;
                const displayRank = useKanaFreq
                  ? item.kana_freq
                  : item.frequency;
                const isSaved = savedWords.has(item.base);
                const hasContext = item.context || item.source_history_id;

                return (
                  <Fragment key={item.id || `${item.base}-${index}`}>
                    <tr
                      className={`transition-colors ${
                        isSaved && !onDelete
                          ? "bg-green-50/50 hover:bg-green-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getBadgeColor(
                            item.level
                          )}`}
                        >
                          {item.level ? `N${item.level}` : "?"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        <div className="text-lg font-medium text-gray-900">
                          {item.base}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.reading || item.surface}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm group relative">
                        <div className="flex items-center gap-1">
                          <FrequencyBadge rank={displayRank} />
                          {/* Visual indicator if Kana frequency is being used */}
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

                      {showCount && (
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.count?.toLocaleString() || "-"}
                        </td>
                      )}

                      <td className="px-3 py-4 text-sm text-gray-600">
                        <div
                          className="line-clamp-2"
                          title={item.meanings?.join(", ")}
                        >
                          {item.meanings?.join("; ") || "-"}
                        </div>
                      </td>

                      {showDate && (
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <div>
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString()
                              : "-"}
                          </div>
                          {hasContext && (
                            <button
                              onClick={() => toggleRow(item.base)}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 flex items-center gap-1 font-medium"
                            >
                              {expandedRows.has(item.base)
                                ? "Hide Context"
                                : "Show Context"}
                            </button>
                          )}
                        </td>
                      )}

                      {(isLoggedIn || onDelete) && (
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          {onDelete ? (
                            <button
                              onClick={() => handleDeleteClick(item.base)}
                              className="text-red-600 hover:text-red-900 hover:bg-red-50 px-3 py-1 rounded transition"
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSaveClick(item.base)}
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
                    {expandedRows.has(item.base) && (
                      <tr className="bg-blue-50/50">
                        <td
                          colSpan={(showDate ? 6 : 5) + (showCount ? 1 : 0)}
                          className="px-6 py-4 text-sm text-gray-700 border-b border-gray-200"
                        >
                          {/* User Context */}
                          {item.context && (
                            <div className="flex gap-3 items-start mb-4 pb-4 border-b border-gray-100">
                              <span className="font-bold text-blue-400 text-xs uppercase tracking-wide select-none mt-0.5 shrink-0">
                                Source
                              </span>
                              <div className="text-gray-800">
                                {renderContext(
                                  item.context,
                                  item.source_history_id
                                )}
                              </div>
                            </div>
                          )}

                          {/* Examples */}
                          <div className="flex gap-3 items-start">
                            <span className="font-bold text-purple-500 text-xs uppercase tracking-wide mt-1 w-14 shrink-0">
                              Examples
                            </span>
                            <div className="w-full">
                              {!examplesMap[item.base] &&
                                !loadingExamples.has(item.base) && (
                                  <button
                                    onClick={() => fetchExamples(item.base)}
                                    className="text-xs bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 transition text-gray-600"
                                  >
                                    Load sentences from Tatoeba
                                  </button>
                                )}
                              {loadingExamples.has(item.base) && (
                                <span className="text-xs text-gray-400">
                                  Loading sentences...
                                </span>
                              )}
                              {examplesMap[item.base] && (
                                <div className="grid gap-2">
                                  {examplesMap[item.base].length === 0 ? (
                                    <div className="text-xs text-gray-400 italic">
                                      No examples found.
                                    </div>
                                  ) : (
                                    examplesMap[item.base].map((ex, i) => (
                                      <div
                                        key={i}
                                        className="text-sm bg-white p-2 rounded border border-gray-100"
                                      >
                                        <div className="text-gray-900">
                                          {ex.jp}
                                        </div>
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
              })
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {(serverSide || processedTokens.length > 0) && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:justify-end gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="flex items-center text-sm text-gray-700 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeSaveAll}
        title="Save Words"
        message={`Are you sure you want to save ${
          wordsToSave.length
        } words to your list? ${
          wordsToSave.length === BULK_LIMIT ? "(List truncated to limit)" : ""
        }`}
        confirmButtonText={`Save ${wordsToSave.length} Words`}
      />

      <ConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={executeDeleteAll}
        title="Delete Words"
        message={`Are you sure you want to delete ${wordsToDelete.length} words? This action cannot be undone.`}
        confirmButtonText={`Delete ${wordsToDelete.length} Words`}
      />
    </div>
  );
}

/**
 * Skeleton loader for the VocabTable component.
 */
export function VocabTableSkeleton() {
  return (
    <div className="mt-2 animate-pulse">
      {/* TOOLBAR */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 gap-4">
        <div className="h-6 bg-gray-200 rounded w-40"></div>
        <div className="flex gap-2">
          <div className="h-8 bg-gray-200 rounded w-32"></div>
          <div className="h-8 bg-gray-200 rounded w-24"></div>
          <div className="h-8 bg-gray-200 rounded w-24"></div>
        </div>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              {[1, 2, 3, 4, 5].map((i) => (
                <th key={i} className="py-3.5 px-3">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                <td className="py-4 px-3">
                  <div className="h-5 bg-gray-200 rounded w-8"></div>
                </td>
                <td className="py-4 px-3">
                  <div className="h-5 bg-gray-200 rounded w-24 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-16"></div>
                </td>
                <td className="py-4 px-3">
                  <div className="h-5 bg-gray-200 rounded w-16"></div>
                </td>
                <td className="py-4 px-3">
                  <div className="h-4 bg-gray-200 rounded w-full max-w-xs"></div>
                </td>
                <td className="py-4 px-3">
                  <div className="h-8 bg-gray-200 rounded w-16 ml-auto"></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
