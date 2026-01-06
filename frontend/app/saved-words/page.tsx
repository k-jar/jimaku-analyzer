"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import ConfirmationDialog from "../components/ConfirmationDialog";
import VocabTable, { VocabTableSkeleton } from "../components/VocabTable";

/**
 * Represents a word saved in the user's vocabulary list.
 */
interface SavedWord {
  word: string; // The Kanji/Base
  level: number; // The JLPT Level
  reading: string; // The reading of the base word
  meanings: string[];
  frequency_rank?: number;
  kana_frequency_rank?: number;
  created_at: string;
  context?: string;
  source_history_id?: number;
}

/**
 * Saved Words Page.
 * Displays a table of words saved by the user and allows for management (deletion).
 */
export default function SavedWords() {
  const [words, setWords] = useState<SavedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<string | null>(null);
  const router = useRouter();

  // Fetch saved words on mount
  useEffect(() => {
    const fetchWords = async () => {
      setLoading(true);
      const token = Cookies.get("token");

      if (!token) {
        router.push("/login");
        return;
      }

      try {
        // Fetch all words and let VocabTable handle client-side filtering/sorting
        const url = `${process.env.NEXT_PUBLIC_API_URL}/words/me`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          Cookies.remove("token");
          router.push("/login");
          return;
        }

        const data = await res.json();
        setWords(data.saved_words);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load words");
      } finally {
        setLoading(false);
      }
    };

    fetchWords();
  }, [router]);

  /**
   * Opens the confirmation dialog for deleting a single word.
   */
  const initiateDelete = (word: string) => {
    setWordToDelete(word);
    setIsConfirmOpen(true);
  };

  /**
   * Executes the deletion of the selected single word.
   */
  const confirmDelete = async () => {
    if (!wordToDelete) return;
    const token = Cookies.get("token");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/words/remove`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ word: wordToDelete }),
        }
      );

      if (res.ok) {
        setWords(words.filter((w) => w.word !== wordToDelete));
        toast.success(`Removed ${wordToDelete}`);
      } else {
        toast.error("Failed to delete");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting word");
    } finally {
      setIsConfirmOpen(false);
      setWordToDelete(null);
    }
  };

  /**
   * Handles bulk deletion of words selected in the VocabTable.
   */
  const handleBulkDelete = async (wordsToDelete: string[]) => {
    const token = Cookies.get("token");
    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/words/remove/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ words: wordsToDelete }),
        }
      );

      if (res.ok) {
        setWords((prev) => prev.filter((w) => !wordsToDelete.includes(w.word)));
        toast.success(`Removed ${wordsToDelete.length} words`);
      } else {
        toast.error("Failed to delete words");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting words");
    }
  };

  // Map SavedWord to TokenResult for VocabTable
  const tableTokens = words.map((w) => ({
    surface: w.word,
    base: w.word,
    reading: w.reading,
    meanings: w.meanings,
    level: w.level,
    frequency: w.frequency_rank,
    kana_freq: w.kana_frequency_rank,
    created_at: w.created_at,
    context: w.context,
    source_history_id: w.source_history_id,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saved Words</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your vocabulary list.
        </p>
      </div>

      {loading ? (
        <VocabTableSkeleton />
      ) : words.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-lg border border-gray-200 border-dashed">
          <div className="text-4xl mb-3">📝</div>
          <h3 className="text-lg font-medium text-gray-900">No saved words</h3>
          <p className="text-gray-500 mt-1">
            You haven't saved any words yet.
            <button
              onClick={() => router.push("/anime")}
              className="text-blue-600 hover:underline ml-1"
            >
              Browse anime
            </button>{" "}
            to find new vocabulary.
          </p>
        </div>
      ) : (
        <VocabTable
          tokens={tableTokens}
          onDelete={initiateDelete}
          onBulkDelete={handleBulkDelete}
          showDate={true}
        />
      )}

      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Remove Word"
        message={`Are you sure you want to remove '${wordToDelete}' from your saved words?`}
        confirmButtonText="Remove"
      />
    </div>
  );
}
