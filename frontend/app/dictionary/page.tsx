"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { VocabTable, VocabTableSkeleton } from "@/components/vocab-table";
import {
  generateAnkiCSV,
  generatePlainText,
  downloadFile,
} from "@/utils/csvExport";

/**
 * Represents a word entry in the global frequency dictionary.
 */
interface DictionaryWord {
  id: number;
  word: string;
  reading?: string;
  meanings: string[];
  level: number | null;
  frequency_rank: number | null;
  kana_frequency_rank?: number | null;
}

/**
 * Dictionary Page.
 * Allows users to browse the full Japanese frequency dictionary with server-side pagination and filtering.
 */
export default function DictionaryPage() {
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastParams, setLastParams] = useState<any>(null);

  /**
   * Fetches dictionary data from the backend based on table parameters.
   * Handles pagination, sorting, and filtering server-side.
   */
  const handleParamsChange = async (params: any) => {
    setLoading(true);
    setLastParams(params);
    try {
      const {
        page,
        itemsPerPage,
        search,
        level,
        minFreq,
        maxFreq,
        hideSaved,
        sortBy,
        sortOrder,
      } = params;

      const query = new URLSearchParams();
      query.set("skip", ((page - 1) * itemsPerPage).toString());
      query.set("limit", itemsPerPage.toString());
      if (search) query.set("search", search);
      if (level) query.set("level", level);
      if (minFreq !== "") query.set("min_freq", minFreq);
      if (maxFreq !== "") query.set("max_freq", maxFreq);
      if (hideSaved) query.set("exclude_saved", "true");
      if (sortBy) query.set("sort", sortBy);
      if (sortOrder) query.set("order", sortOrder);

      const token = Cookies.get("token");
      const headers: any = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL
        }/words/dictionary?${query.toString()}`,
        { headers },
      );
      if (!res.ok) throw new Error("Failed to load dictionary");
      const data = await res.json();

      setWords(data.items);
      setTotalItems(data.total);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dictionary");
    } finally {
      setLoading(false);
    }
  };

  // Map dictionary words to the format expected by VocabTable
  const tableTokens = useMemo(() => {
    return words.map((w) => ({
      id: w.id,
      surface: w.word,
      base: w.word,
      reading: w.reading,
      meanings: w.meanings,
      level: w.level,
      frequency: w.frequency_rank || undefined,
      kana_freq: w.kana_frequency_rank || undefined,
    }));
  }, [words]);

  /**
   * Saves a single word to the user's vocabulary list.
   */
  const saveWord = async (word: string) => {
    const token = Cookies.get("token");
    if (!token) {
      toast.error("Please login to save words.");
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/words/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          word: word,
          sentence: "Dictionary",
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        toast.success(resData.message);
      } else {
        toast.error("Failed to save.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error saving word");
    }
  };

  /**
   * Helper to fetch all words matching current filters (ignoring pagination).
   * Used for bulk operations like "Save All" or "Export".
   */
  const fetchAllMatchingWords = async () => {
    if (!lastParams) return [];
    const { search, level, minFreq, maxFreq, hideSaved, sortBy, sortOrder } =
      lastParams;

    const query = new URLSearchParams();
    query.set("skip", "0");
    query.set("limit", "100000"); // Fetch all
    if (search) query.set("search", search);
    if (level) query.set("level", level);
    if (minFreq !== "") query.set("min_freq", minFreq);
    if (maxFreq !== "") query.set("max_freq", maxFreq);
    if (hideSaved) query.set("exclude_saved", "true");
    if (sortBy) query.set("sort", sortBy);
    if (sortOrder) query.set("order", sortOrder);

    const token = Cookies.get("token");
    const headers: any = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/words/dictionary?${query.toString()}`,
      { headers },
    );
    if (!res.ok) throw new Error("Failed to fetch all words");
    const data = await res.json();
    return data.items as DictionaryWord[];
  };

  /**
   * Prepares the list of words for bulk saving by fetching all matches.
   */
  const handlePrepareBulkSave = async () => {
    const allWords = await fetchAllMatchingWords();
    return allWords.map((w) => w.word);
  };

  /**
   * Executes the bulk save operation.
   */
  const handleExecuteBulkSave = async (wordsToSave: string[]) => {
    const toastId = toast.loading(`Saving ${wordsToSave.length} words...`);
    try {
      const token = Cookies.get("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/words/save/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ words: wordsToSave }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        toast.success(`Saved ${data.saved_count} words!`, { id: toastId });
      } else {
        toast.error("Failed to save words", { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error("Error during bulk save", { id: toastId });
    }
  };

  /**
   * Handles bulk export of the currently filtered dictionary view.
   */
  const handleBulkExport = async (type: "csv" | "txt") => {
    const toastId = toast.loading("Preparing export...");
    try {
      const allWords = await fetchAllMatchingWords();
      const exportData = allWords.map((w) => ({
        word: w.word,
        reading: w.reading || "",
        meanings: w.meanings || [],
        level: w.level,
        context: "Dictionary",
      }));

      if (type === "csv") {
        const content = generateAnkiCSV(exportData);
        downloadFile(
          content,
          "dictionary_export.csv",
          "text/csv;charset=utf-8;",
        );
      } else {
        const content = generatePlainText(exportData);
        downloadFile(
          content,
          "dictionary_export.txt",
          "text/plain;charset=utf-8;",
        );
      }
      toast.success("Export complete", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Export failed", { id: toastId });
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dictionary</h1>
        <p className="text-gray-500 mt-2">
          Browse the full frequency dictionary.
        </p>
      </div>

      {loading && <VocabTableSkeleton />}

      <div className={loading ? "hidden" : "block"}>
        <VocabTable
          tokens={tableTokens}
          onSave={saveWord}
          contextLabel="Dictionary"
          serverSide={true}
          totalItems={totalItems}
          onParamsChange={handleParamsChange}
          initialMinFreq={0}
          initialMaxFreq={100000}
          onPrepareBulkSave={handlePrepareBulkSave}
          onExecuteBulkSave={handleExecuteBulkSave}
          onBulkExport={handleBulkExport}
          initialSortBy="freq"
          initialSortOrder="asc"
        />
      </div>
    </main>
  );
}
