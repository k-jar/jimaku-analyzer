"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import VocabTable, { VocabTableSkeleton } from "../../../components/VocabTable";

/**
 * Represents a vocabulary item specific to a series.
 */
interface VocabItem {
  word: string;
  reading?: string;
  meanings: string[];
  level: number | null;
  frequency_rank: number | null;
  kana_frequency_rank?: number | null;
  count_in_episode: number;
}

/**
 * Represents the aggregated vocabulary data for a series.
 */
interface SeriesVocabData {
  series_id: number;
  series_title: string;
  total_unique_words: number;
  vocab_list: VocabItem[];
}

/**
 * Series Vocabulary Page.
 * Displays a table of all unique words found in a specific anime series.
 */
export default function SeriesVocab() {
  const { id } = useParams();
  const [data, setData] = useState<SeriesVocabData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch vocabulary data on mount
  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/anime/${id}/analysis`
        );
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        toast.error("Could not load vocabulary");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Map API data to VocabTable format
  const tableTokens = useMemo(() => {
    if (!data) return [];
    return data.vocab_list.map((v) => ({
      surface: v.word,
      base: v.word,
      reading: v.reading,
      meanings: v.meanings,
      level: v.level,
      frequency: v.frequency_rank || undefined,
      kana_freq: v.kana_frequency_rank || undefined,
      count: v.count_in_episode,
    }));
  }, [data]);

  /**
   * Saves a word to the user's list with series context.
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
          sentence: JSON.stringify({
            type: "anime",
            seriesId: data?.series_id,
            seriesTitle: data?.series_title || "Anime Series",
          }),
        }),
      });
      if (res.ok) toast.success("Saved");
      else toast.error("Failed");
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-10 animate-pulse">
        <div className="mb-6">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
        <VocabTableSkeleton />
      </main>
    );
  }

  if (!data) return <div className="p-10 text-center">Data not found.</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href={`/anime/${data.series_id}`}
            className="text-sm text-gray-500 hover:underline"
          >
            ← Back to Series
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            {data.series_title} Vocabulary
          </h1>
          <p className="text-gray-500">
            {data.total_unique_words.toLocaleString()} unique words total
          </p>
        </div>
      </div>

      <VocabTable
        tokens={tableTokens}
        onSave={saveWord}
        contextLabel={`Series ${data.series_id}`}
        showCount={true}
      />
    </main>
  );
}
