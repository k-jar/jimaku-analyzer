"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";

export interface TokenResult {
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

export interface FilterParams {
  page: number;
  itemsPerPage: number;
  search: string;
  level: string;
  minFreq: number | "";
  maxFreq: number | "";
  hideSaved: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

interface UseVocabFiltersOptions {
  tokens: TokenResult[];
  savedWords: Set<string>;
  serverSide?: boolean;
  totalItems?: number;
  onParamsChange?: (params: FilterParams) => void;
  initialMinFreq?: number | "";
  initialMaxFreq?: number | "";
  initialSortBy?: string;
  initialSortOrder?: "asc" | "desc";
}

const ITEMS_PER_PAGE = 50;

export function useVocabFilters({
  tokens,
  savedWords,
  serverSide,
  totalItems,
  onParamsChange,
  initialMinFreq = 0,
  initialMaxFreq = 100000,
  initialSortBy = "count",
  initialSortOrder = "desc",
}: UseVocabFiltersOptions) {
  // Filter state
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialSortOrder);
  const [hideSaved, setHideSaved] = useState(false);
  const [minFreq, setMinFreq] = useState<number | "">(initialMinFreq);
  const [maxFreq, setMaxFreq] = useState<number | "">(initialMaxFreq);
  const [currentPage, setCurrentPage] = useState(1);

  // Track if this is the initial mount
  const isInitialMount = useRef(true);
  // Store callback ref to avoid dependency issues
  const onParamsChangeRef = useRef(onParamsChange);
  onParamsChangeRef.current = onParamsChange;

  // Initial fetch on mount (no debounce)
  useEffect(() => {
    if (serverSide && onParamsChangeRef.current) {
      onParamsChangeRef.current({
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
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-side parameter sync with debounce (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (serverSide && onParamsChangeRef.current) {
      const timeoutId = setTimeout(() => {
        onParamsChangeRef.current?.({
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
      }, 600);
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

  // Client-side filtering and sorting
  const processedTokens = useMemo(() => {
    if (serverSide) return tokens;

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
            t.meanings.some((m: string) => m.toLowerCase().includes(q))),
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;

      switch (sortBy) {
        case "level":
          valA = a.level || 99;
          valB = b.level || 99;
          break;
        case "freq":
          valA = Math.min(a.frequency || 999999, a.kana_freq || 999999);
          valB = Math.min(b.frequency || 999999, b.kana_freq || 999999);
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

  // Reset page when filters change (but not sort - sorting should preserve page)
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedLevel, searchQuery, minFreq, maxFreq, hideSaved]);

  // Ensure current page is valid if list shrinks
  useEffect(() => {
    const total = serverSide ? totalItems || 0 : processedTokens.length;
    const maxPage = Math.ceil(total / ITEMS_PER_PAGE) || 1;
    if (!serverSide && currentPage > maxPage) setCurrentPage(maxPage);
  }, [processedTokens.length, serverSide, totalItems, currentPage]);

  // Pagination
  const paginatedTokens = serverSide
    ? processedTokens
    : processedTokens.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      );

  const totalPages =
    Math.ceil(
      (serverSide ? totalItems || 0 : processedTokens.length) / ITEMS_PER_PAGE,
    ) || 1;

  const totalCount = serverSide ? totalItems || 0 : processedTokens.length;

  // Sort handler
  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("asc");
      }
    },
    [sortBy],
  );

  return {
    // Filter state
    selectedLevel,
    setSelectedLevel,
    searchQuery,
    setSearchQuery,
    sortBy,
    sortOrder,
    hideSaved,
    setHideSaved,
    minFreq,
    setMinFreq,
    maxFreq,
    setMaxFreq,

    // Pagination
    currentPage,
    setCurrentPage,
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,

    // Processed data
    processedTokens,
    paginatedTokens,
    totalCount,

    // Handlers
    handleSort,
  };
}
