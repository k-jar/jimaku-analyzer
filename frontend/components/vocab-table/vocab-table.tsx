"use client";

import {
  generateAnkiCSV,
  generatePlainText,
  downloadFile,
} from "@/utils/csvExport";
import ConfirmationDialog from "../ConfirmationDialog";
import {
  useVocabFilters,
  type FilterParams,
  type TokenResult,
} from "@/hooks/use-vocab-filters";
import { useSavedWords } from "@/hooks/use-saved-words";
import { useExamples } from "@/hooks/use-examples";
import { VocabToolbar } from "./vocab-toolbar";
import { VocabTableHeader } from "./vocab-table-header";
import { VocabTableRow } from "./vocab-table-row";
import { VocabPagination } from "./vocab-pagination";

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
  onParamsChange?: (params: FilterParams) => void;
  initialMinFreq?: number | "";
  initialMaxFreq?: number | "";
  initialSortBy?: string;
  initialSortOrder?: "asc" | "desc";
  /** Callback to fetch words for bulk save (server-side mode). */
  onPrepareBulkSave?: () => Promise<string[]>;
  /** Callback to execute bulk save (server-side mode). */
  onExecuteBulkSave?: (words: string[]) => Promise<void>;
  /** Callback to handle bulk export (server-side mode). */
  onBulkExport?: (type: "csv" | "txt") => Promise<void>;
}

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
  initialSortBy = "count",
  initialSortOrder = "desc",
  onPrepareBulkSave,
  onExecuteBulkSave,
  onBulkExport,
}: VocabTableProps) {
  // Saved words state and actions
  const savedWordsHook = useSavedWords({
    onSave,
    onDelete,
    onBulkDelete,
    onPrepareBulkSave,
    onExecuteBulkSave,
  });

  // Filtering, sorting, and pagination
  const filtersHook = useVocabFilters({
    tokens,
    savedWords: savedWordsHook.savedWords,
    serverSide,
    totalItems,
    onParamsChange,
    initialMinFreq,
    initialMaxFreq,
    initialSortBy,
    initialSortOrder,
  });

  // Examples and row expansion
  const examplesHook = useExamples();

  // Export handler
  const handleExport = async (type: "csv" | "txt") => {
    if (onBulkExport) {
      await onBulkExport(type);
      return;
    }

    const exportData = filtersHook.processedTokens.map((t) => ({
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
  };

  // Save all handler
  const handleSaveAll = () => {
    const words = filtersHook.processedTokens.map((t) => t.base);
    savedWordsHook.prepareBulkSave(words);
  };

  // Delete all handler
  const handleDeleteAll = () => {
    const words = filtersHook.processedTokens.map((t) => t.base);
    savedWordsHook.prepareBulkDelete(words);
  };

  const showActions = savedWordsHook.isLoggedIn || !!onDelete;

  if (!serverSide && tokens.length === 0) return null;

  return (
    <div className="mt-2">
      {/* Toolbar */}
      <VocabToolbar
        totalCount={filtersHook.totalCount}
        searchQuery={filtersHook.searchQuery}
        onSearchChange={filtersHook.setSearchQuery}
        minFreq={filtersHook.minFreq}
        maxFreq={filtersHook.maxFreq}
        onMinFreqChange={filtersHook.setMinFreq}
        onMaxFreqChange={filtersHook.setMaxFreq}
        hideSaved={filtersHook.hideSaved}
        onHideSavedChange={filtersHook.setHideSaved}
        selectedLevel={filtersHook.selectedLevel}
        onLevelChange={filtersHook.setSelectedLevel}
        isLoggedIn={savedWordsHook.isLoggedIn}
        showSaveActions={!!onSave}
        showDeleteAction={!!onBulkDelete}
        hasItems={filtersHook.processedTokens.length > 0}
        onSaveAll={handleSaveAll}
        onDeleteAll={handleDeleteAll}
        onExport={handleExport}
      />

      {/* Table */}
      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-300">
          <VocabTableHeader
            sortBy={filtersHook.sortBy}
            sortOrder={filtersHook.sortOrder}
            onSort={filtersHook.handleSort}
            showDate={showDate}
            showCount={showCount}
            showActions={showActions}
          />

          <tbody className="divide-y divide-gray-200 bg-white">
            {filtersHook.paginatedTokens.length === 0 ? (
              <tr>
                <td
                  colSpan={(showDate ? 6 : 5) + (showCount ? 1 : 0)}
                  className="text-center py-8 text-gray-500"
                >
                  No words match your filters.
                </td>
              </tr>
            ) : (
              filtersHook.paginatedTokens.map((item, index) => (
                <VocabTableRow
                  key={item.id || `${item.base}-${index}`}
                  item={item}
                  index={index}
                  isSaved={savedWordsHook.savedWords.has(item.base)}
                  showDate={showDate}
                  showCount={showCount}
                  showActions={showActions}
                  isDeleteMode={!!onDelete}
                  isExpanded={examplesHook.isExpanded(item.base)}
                  isLoadingExamples={examplesHook.isLoading(item.base)}
                  examples={examplesHook.getExamples(item.base)}
                  onToggleExpand={() => examplesHook.toggleRow(item.base)}
                  onSave={() => savedWordsHook.handleSaveClick(item.base)}
                  onDelete={() => savedWordsHook.handleDeleteClick(item.base)}
                  onFetchExamples={() => examplesHook.fetchExamples(item.base)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {(serverSide || filtersHook.processedTokens.length > 0) && (
          <VocabPagination
            currentPage={filtersHook.currentPage}
            totalPages={filtersHook.totalPages}
            onPageChange={filtersHook.setCurrentPage}
          />
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={savedWordsHook.isConfirmOpen}
        onClose={() => savedWordsHook.setIsConfirmOpen(false)}
        onConfirm={savedWordsHook.executeSaveAll}
        title="Save Words"
        message={`Are you sure you want to save ${
          savedWordsHook.wordsToSave.length
        } words to your list? ${
          savedWordsHook.wordsToSave.length === savedWordsHook.bulkLimit
            ? "(List truncated to limit)"
            : ""
        }`}
        confirmButtonText={`Save ${savedWordsHook.wordsToSave.length} Words`}
      />

      <ConfirmationDialog
        isOpen={savedWordsHook.isDeleteConfirmOpen}
        onClose={() => savedWordsHook.setIsDeleteConfirmOpen(false)}
        onConfirm={savedWordsHook.executeDeleteAll}
        title="Delete Words"
        message={`Are you sure you want to delete ${savedWordsHook.wordsToDelete.length} words? This action cannot be undone.`}
        confirmButtonText={`Delete ${savedWordsHook.wordsToDelete.length} Words`}
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
      {/* Toolbar Skeleton */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 gap-4">
        <div className="h-6 bg-gray-200 rounded w-40"></div>
        <div className="flex gap-2">
          <div className="h-8 bg-gray-200 rounded w-32"></div>
          <div className="h-8 bg-gray-200 rounded w-24"></div>
          <div className="h-8 bg-gray-200 rounded w-24"></div>
        </div>
      </div>

      {/* Table Skeleton */}
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
