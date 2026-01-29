"use client";

import { useState, useCallback } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

export interface ExampleSentence {
  jp: string;
  en: string;
}

export function useExamples() {
  const [examplesMap, setExamplesMap] = useState<
    Record<string, ExampleSentence[]>
  >({});
  const [loadingExamples, setLoadingExamples] = useState<Set<string>>(
    new Set(),
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((word: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(word)) newSet.delete(word);
      else newSet.add(word);
      return newSet;
    });
  }, []);

  const fetchExamples = useCallback(
    async (word: string) => {
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
          },
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
    },
    [examplesMap],
  );

  const isExpanded = useCallback(
    (word: string) => expandedRows.has(word),
    [expandedRows],
  );

  const isLoading = useCallback(
    (word: string) => loadingExamples.has(word),
    [loadingExamples],
  );

  const getExamples = useCallback(
    (word: string) => examplesMap[word],
    [examplesMap],
  );

  return {
    expandedRows,
    toggleRow,
    fetchExamples,
    isExpanded,
    isLoading,
    getExamples,
  };
}
