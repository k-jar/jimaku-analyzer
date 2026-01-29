"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Cookies from "js-cookie";
import Link from "next/link";
import StatsPanel, { StatsPanelSkeleton } from "@/components/StatsPanel";
import DifficultyBadge from "@/components/DifficultyBadge";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import toast from "react-hot-toast";

/**
 * Represents a single episode within a series.
 */
interface Episode {
  id: number;
  episode_number: number;
  title?: string;
  jr_difficulty: number;
  ml_difficulty: number;
  unique_words: number;
  unique_kanji: number;
}

/**
 * Represents the full details of an anime series, including aggregate statistics.
 */
interface SeriesDetail {
  stats: {
    total_words: number;
    general_vocab_thresholds: Record<string, number>;
    general_vocab_stats: { rank: number; coverage: number }[];
    local_vocab_stats?: { unique: number; coverage: number }[];
    local_vocab_thresholds?: Record<string, number>;
    detailed_stats?: {
      average_sentence_length?: number;
      sentence_count?: number;
    };
    pos_distribution: Record<string, number>;
    jlpt_distribution: Record<string, number>;
    unique_words: number;
    unique_words_once: number;
    unique_kanji: number;
    unique_kanji_once: number;
    jr_difficulty: number;
    ml_difficulty: number;
  };
  series: {
    jimaku_id: any;
    anilist_id: any;
    cpm: number;
    id: number;
    title_jp: string;
    title_en?: string;
    title_romaji?: string;
    thumbnail_url?: string;
    jr_difficulty: number;
    ml_difficulty: number;
    total_words: number;
    unique_words: number;
    unique_words_once: number;
    unique_kanji: number;
    unique_kanji_once: number;
    jlpt_distribution: any;
    general_vocab_stats: any;
    general_vocab_thresholds: any;
    pos_distribution: any;
    description?: string;
    anilist_rating?: number;
    popularity?: number;
    genres?: string[];
    computedStats?: any;
  };
  episodes: Episode[];
  user_stats?: {
    known_unique_count: number;
    known_unique_pct: number;
    comprehension_pct: number;
  } | null;
}

/**
 * Series Detail Page.
 * Displays comprehensive statistics for a specific anime series, including difficulty, vocabulary breakdown, and episode list.
 */
export default function SeriesDetail() {
  const { id } = useParams();
  const [data, setData] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const difficulty = data?.series?.ml_difficulty || 0;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [userStatus, setUserStatus] = useState<string | null>(null);

  // Constants
  const AVG_CPM = 320;

  // Fetch series data on mount
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
          `${process.env.NEXT_PUBLIC_API_URL}/anime/${id}`,
          { headers },
        );

        if (!res.ok) throw new Error("Not found");
        const json = await res.json();

        setIsLoggedIn(!!token);
        if (token) {
          const statusRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/anime/${id}/status`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setUserStatus(statusData.status);
          }
        }

        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10 animate-pulse">
        <div className="flex flex-col md:flex-row gap-8 mb-12">
          {/* Left: Image */}
          <div className="w-48 mx-auto md:mx-0 md:w-1/5 lg:w-1/6 flex-shrink-0">
            <div className="aspect-[2/3] bg-gray-200 rounded-xl mb-4"></div>
            <div className="h-10 bg-gray-200 rounded-lg"></div>
          </div>

          {/* Right: Info */}
          <div className="flex-grow">
            <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
            <div className="h-10 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>

            <div className="flex gap-2 mb-6">
              <div className="h-6 bg-gray-200 rounded w-16"></div>
              <div className="h-6 bg-gray-200 rounded w-16"></div>
            </div>

            <div className="flex gap-4 mb-6">
              <div className="h-12 bg-gray-200 rounded w-24"></div>
              <div className="h-12 bg-gray-200 rounded w-24"></div>
              <div className="h-12 bg-gray-200 rounded w-24"></div>
            </div>

            <div className="space-y-2 mb-8">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>

            <StatsPanelSkeleton />
          </div>
        </div>

        <div className="h-8 bg-gray-200 rounded w-32 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </main>
    );
  }

  if (!data) return <div className="p-10 text-center">Anime not found.</div>;

  /**
   * Updates the user's watch status for this series (e.g., Watching, Completed).
   */
  const performStatusUpdate = async (newStatus: string) => {
    const token = Cookies.get("token");
    if (!token) {
      toast.error("Please login to save progress");
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/anime/${data.series.id}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      const result = await res.json();
      setUserStatus(result.status);

      if (newStatus === "") {
        toast.success("Removed from list");
      } else {
        const formatted = newStatus
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        toast.success(`Status changed to ${formatted}`);
      }

      // Close the dialog on successful removal
      if (newStatus === "") {
        setIsConfirmOpen(false);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to update status");
    }
  };

  /**
   * Handles the status change dropdown. Triggers confirmation if removing status.
   */
  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "") {
      setIsConfirmOpen(true);
    } else {
      performStatusUpdate(newStatus);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => performStatusUpdate("")}
        title="Remove Anime"
        message="Are you sure you want to remove this anime from your list?"
        confirmButtonText="Remove"
      />
      <div className="flex flex-col md:flex-row gap-8 mb-12">
        {/* Left: Image */}
        <div className="w-48 mx-auto md:mx-0 md:w-1/5 lg:w-1/6 flex-shrink-0">
          <div className="aspect-[2/3] bg-gray-200 rounded-xl overflow-hidden shadow-lg">
            {data.series.thumbnail_url ? (
              <img
                src={data.series.thumbnail_url}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl">
                📺
              </div>
            )}
          </div>

          {/* Details Button */}
          <Link
            href={`/anime/${data.series.id}/vocab`}
            className="mt-4 block w-full bg-blue-600 text-white text-center py-3 rounded-lg font-bold hover:bg-blue-700 transition shadow-sm"
          >
            View Series Vocab
          </Link>

          {/* Status Selector */}
          <div className="mt-4">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              My Status
            </label>
            {isLoggedIn ? (
              <select
                value={userStatus || ""}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white"
              >
                <option value="">None</option>
                <option value="plan_to_watch">Plan to Watch</option>
                <option value="watching">Watching</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped</option>
              </select>
            ) : (
              <div className="w-full border border-gray-200 rounded-md p-2 text-sm bg-gray-50 text-gray-500 text-center">
                <Link
                  href="/login"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Log in
                </Link>{" "}
                to track status
              </div>
            )}
          </div>
        </div>

        {/* Right: Info & Stats */}
        <div className="flex-grow">
          <Link
            href="/anime"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← Back to Gallery
          </Link>
          <h1 className="text-4xl font-black text-gray-900 mt-2 mb-1">
            {data.series.title_jp}
          </h1>
          {data.series.title_en && (
            <h2 className="text-xl text-gray-500 font-medium">
              {data.series.title_en}
            </h2>
          )}

          {/* External Links */}
          <div className="flex items-center gap-2 mt-3 mb-4">
            {data.series.anilist_id && (
              <a
                href={`https://anilist.co/anime/${data.series.anilist_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full hover:bg-blue-200 transition"
              >
                AniList
              </a>
            )}
            {data.series.jimaku_id && (
              <a
                href={`https://jimaku.cc/entry/${data.series.jimaku_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold bg-gray-100 text-gray-800 px-3 py-1 rounded-full hover:bg-gray-200 transition"
              >
                Jimaku
              </a>
            )}
          </div>

          {/* Genres */}
          {data.series.genres && (
            <div className="flex flex-wrap gap-2 mb-4">
              {data.series.genres.map((g) => (
                <span
                  key={g}
                  className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600 font-medium"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Top Stats Row*/}
          <div className="flex flex-wrap gap-4 mt-4 mb-6">
            {/* AniList Score */}
            {data.series.anilist_rating && (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">
                  AniList Rating
                </span>
                <span className="text-xl font-bold text-gray-800">
                  {data.series.anilist_rating}%
                </span>
              </div>
            )}

            {data.series.popularity && (
              <>
                <div className="w-px bg-gray-200 h-10 mx-2"></div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400">
                    Popularity
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-gray-800">
                      {data.series.popularity.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      users
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="w-px bg-gray-200 h-10 mx-2"></div>

            {/* Difficulty */}
            <div className="flex flex-col">
              <DifficultyBadge score={data.series.ml_difficulty} />
            </div>

            <div className="w-px bg-gray-200 h-8 mx-1"></div>

            {/* Speed (CPM) */}
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400">
                Avg Speed
              </span>
              <div
                className="flex items-center gap-1"
                title={`Characters Per Minute (Median: ${AVG_CPM})`}
              >
                <span className="text-xl font-bold text-gray-800">
                  {data.series.cpm > 0 ? data.series.cpm : "-"}
                </span>
                <span className="text-xs text-gray-500 font-medium">CPM</span>
              </div>
              {data.series.cpm > 0 && (
                <span
                  className={`text-[10px] font-medium ${
                    Math.abs(data.series.cpm - AVG_CPM) < 30
                      ? "text-gray-400"
                      : data.series.cpm > AVG_CPM
                        ? "text-orange-500"
                        : "text-blue-500"
                  }`}
                >
                  {Math.abs(data.series.cpm - AVG_CPM) < 30
                    ? "Normal speed"
                    : data.series.cpm > AVG_CPM
                      ? "Faster than average"
                      : "Slower than average"}
                </span>
              )}
            </div>
          </div>

          {/* description */}
          {data.series.description && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-gray-900 uppercase mb-2">
                description
              </h3>
              <div
                className="text-gray-600 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: data.series.description }} // AniList returns HTML breaks
              />
            </div>
          )}
          {/* @ts-ignore - attached computedStats manually above */}
          <StatsPanel stats={data.stats} userStats={data.user_stats} />
        </div>
      </div>

      {/* Episode List */}
      <h3 className="text-2xl font-bold text-gray-900 mb-6">
        Episodes ({data.episodes.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.episodes.map((ep) => (
          <Link
            key={ep.id}
            href={`/anime/episode/${ep.id}`}
            className="group block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="font-bold text-gray-800 group-hover:text-blue-600">
                Episode {ep.episode_number}
              </div>
              <DifficultyBadge score={ep.ml_difficulty} size="xs" />
            </div>
            <div className="text-xs text-gray-500 flex gap-3">
              <span>{ep.unique_words} words</span>
              <span>{ep.unique_kanji} kanji</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
