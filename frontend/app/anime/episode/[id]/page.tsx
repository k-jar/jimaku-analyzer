"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import { VocabTable, VocabTableSkeleton } from "@/components/vocab-table";
import StatsPanel, { StatsPanelSkeleton } from "@/components/StatsPanel";
import DifficultyBadge from "@/components/DifficultyBadge";
import ExclusionTooltip from "@/components/ExclusionTooltip";

/**
 * Represents a vocabulary item specific to an episode.
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
 * Represents the analysis data for a single episode.
 */
interface EpisodeData {
  episode_id: number;
  series_id: number;
  series_title: string;
  episode_number: number;
  total_unique_words: number;
  stats: any;
  vocab_list: VocabItem[];
  user_stats?: {
    known_unique_count: number;
    known_unique_pct: number;
    comprehension_pct: number;
  } | null;
  computedStats?: any;
}

/**
 * Episode Analysis Page.
 * Displays detailed statistics and vocabulary for a specific anime episode.
 */
export default function EpisodeAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState<EpisodeData | null>(null);
  const [loading, setLoading] = useState(true);

  // Constants
  const AVG_CPM = 320;

  // Fetch episode data on mount
  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const token = Cookies.get("token");
        const headers: HeadersInit = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/anime/episode/${id}/analysis`,
          { headers },
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
   * Saves a word to the user's list with episode context.
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
            episodeId: data?.episode_id,
            episodeNumber: data?.episode_number,
          }),
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
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-10 animate-pulse">
        <div className="mb-8">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-10 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="flex gap-4">
            <div className="h-12 bg-gray-200 rounded w-24"></div>
            <div className="h-12 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
        <div className="mb-12">
          <StatsPanelSkeleton />
        </div>
        <div className="h-8 bg-gray-200 rounded w-40 mb-4"></div>
        <VocabTableSkeleton />
      </main>
    );
  }

  if (!data) return <div className="p-10 text-center">Data not found.</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <Link
            href={`/anime/${data.series_id}`}
            className="text-sm text-gray-500 hover:underline"
          >
            ← Back to Episodes
          </Link>
          <h1 className="text-3xl font-black text-gray-900 mt-2 mb-4">
            {data.series_title} Episode {data.episode_number}
          </h1>

          {/* Top Stats Row (Matching Series Style) */}
          <div className="flex flex-wrap gap-6 items-center">
            {/* Difficulty */}
            <div className="flex flex-col">
              <DifficultyBadge score={data.stats.ml_difficulty} />
            </div>

            <div className="w-px bg-gray-200 h-10 mx-1"></div>

            {/* Unique Words */}
            <div className="flex flex-col relative group cursor-help">
              <span className="text-[10px] uppercase font-bold text-gray-400">
                Unique Vocab
              </span>
              <span className="text-xl font-bold text-gray-800">
                {data.total_unique_words.toLocaleString()}
              </span>
              {/* Tooltip */}
              <ExclusionTooltip />
            </div>

            {/* Speed (CPM) */}
            {data.stats.cpm > 0 && (
              <>
                <div className="w-px bg-gray-200 h-10 mx-1"></div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400">
                    Speed
                  </span>
                  <div
                    className="flex items-center gap-1"
                    title={`Characters Per Minute (Median: ${AVG_CPM})`}
                  >
                    <span className="text-xl font-bold text-gray-800">
                      {data.stats.cpm}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      CPM
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-medium ${
                      Math.abs(data.stats.cpm - AVG_CPM) < 30
                        ? "text-gray-400"
                        : data.stats.cpm > AVG_CPM
                          ? "text-orange-500"
                          : "text-blue-500"
                    }`}
                  >
                    {Math.abs(data.stats.cpm - AVG_CPM) < 30
                      ? "Normal speed"
                      : data.stats.cpm > AVG_CPM
                        ? "Faster than average"
                        : "Slower than average"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mb-12">
        <StatsPanel stats={data.stats} userStats={data.user_stats} />
      </div>

      {/* Vocab table */}
      <h2 className="text-xl font-bold text-gray-800 mb-4">Vocabulary Table</h2>
      <VocabTable
        tokens={tableTokens}
        onSave={saveWord}
        contextLabel={`Episode ${data.episode_number}`}
        showCount={true}
        initialSortBy="count"
        initialSortOrder="desc"
      />
    </main>
  );
}
