"use client";

import { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

const BULK_LIMIT = 5000;

interface UseSavedWordsOptions {
  onSave?: (word: string) => void;
  onDelete?: (word: string) => void;
  onBulkDelete?: (words: string[]) => Promise<void>;
  onPrepareBulkSave?: () => Promise<string[]>;
  onExecuteBulkSave?: (words: string[]) => Promise<void>;
}

export function useSavedWords({
  onSave,
  onDelete,
  onBulkDelete,
  onPrepareBulkSave,
  onExecuteBulkSave,
}: UseSavedWordsOptions = {}) {
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [wordsToSave, setWordsToSave] = useState<string[]>([]);
  const [wordsToDelete, setWordsToDelete] = useState<string[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

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

  const handleSaveClick = useCallback(
    (word: string) => {
      if (onSave) onSave(word);
      setSavedWords((prev) => new Set(prev).add(word));
    },
    [onSave],
  );

  const handleDeleteClick = useCallback(
    (word: string) => {
      if (onDelete) onDelete(word);
    },
    [onDelete],
  );

  // Prepares bulk save operation
  const prepareBulkSave = useCallback(
    async (filteredWords: string[]) => {
      if (!isLoggedIn) return;

      let toSave: string[] = [];

      if (onPrepareBulkSave) {
        const toastId = toast.loading("Fetching words...");
        try {
          toSave = await onPrepareBulkSave();
          toast.dismiss(toastId);
        } catch {
          toast.error("Failed to prepare save", { id: toastId });
          return;
        }
      } else {
        toSave = filteredWords.filter((word) => !savedWords.has(word));
      }

      if (toSave.length === 0) {
        toast.error("No new words to save");
        return;
      }

      if (toSave.length > BULK_LIMIT) {
        toSave = toSave.slice(0, BULK_LIMIT);
      }

      setWordsToSave(toSave);
      setIsConfirmOpen(true);
    },
    [isLoggedIn, onPrepareBulkSave, savedWords],
  );

  // Executes bulk save operation
  const executeSaveAll = useCallback(async () => {
    if (onExecuteBulkSave) {
      await onExecuteBulkSave(wordsToSave);
      setSavedWords((prev) => {
        const next = new Set(prev);
        wordsToSave.forEach((w) => next.add(w));
        return next;
      });
      setIsConfirmOpen(false);
      setWordsToSave([]);
      return;
    }

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
        },
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
  }, [onExecuteBulkSave, wordsToSave]);

  const prepareBulkDelete = useCallback((words: string[]) => {
    if (words.length === 0) {
      toast.error("No words to delete");
      return;
    }
    setWordsToDelete(words);
    setIsDeleteConfirmOpen(true);
  }, []);

  const executeDeleteAll = useCallback(async () => {
    if (onBulkDelete) {
      await onBulkDelete(wordsToDelete);
      setIsDeleteConfirmOpen(false);
      setWordsToDelete([]);
    }
  }, [onBulkDelete, wordsToDelete]);

  return {
    savedWords,
    isLoggedIn,
    wordsToSave,
    wordsToDelete,
    isConfirmOpen,
    setIsConfirmOpen,
    isDeleteConfirmOpen,
    setIsDeleteConfirmOpen,
    handleSaveClick,
    handleDeleteClick,
    prepareBulkSave,
    executeSaveAll,
    prepareBulkDelete,
    executeDeleteAll,
    bulkLimit: BULK_LIMIT,
  };
}
