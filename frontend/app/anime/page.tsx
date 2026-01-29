"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { useRouter, useSearchParams } from "next/navigation";
import DifficultyBadge from "@/components/DifficultyBadge";

/**
 * Custom hook to debounce a value.
 * Useful for search inputs to avoid excessive API calls.
 */
function useDebounceValue(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

/**
 * Represents an Anime series returned by the API.
 */
interface AnimeSeries {
  unique_words: any;
  id: number;
  title_jp: string;
  title_en?: string;
  title_romaji?: string;
  thumbnail_url?: string;
  anilist_rating?: number;
  popularity?: number;
  jr_difficulty: number;
  ml_difficulty: number;
  unique_words_count: number;
  user_status?: string;
}

/**
 * Predefined difficulty ranges for filtering anime.
 * Maps roughly to JLPT levels based on the ML difficulty score.
 */
const DIFFICULTY_RANGES = [
  { label: "All Difficulties", min: null, max: null },
  { label: "N4 - Beginner (0.0 - 0.9)", min: 0.0, max: 0.9 },
  { label: "N3 - Pre-Intermediate (1.0 - 2.4)", min: 1.0, max: 2.4 },
  { label: "N3 (Hard) - Lower Intermediate (2.5 - 4.9)", min: 2.5, max: 4.9 },
  { label: "N2 - Intermediate (5.0 - 6.9)", min: 5.0, max: 6.9 },
  { label: "N2 (Hard) - Upper Intermediate (7.0 - 8.4)", min: 7.0, max: 8.4 },
  { label: "N1 - Advanced (8.5 - 10.0)", min: 8.5, max: 10.0 },
];

/**
 * Skeleton loader for individual anime cards.
 */
function AnimeSkeleton() {
  return (
    <div className="block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="aspect-2/3 bg-gray-200 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
        <div className="flex gap-2 mt-2">
          <div className="h-3 bg-gray-200 rounded animate-pulse w-1/4" />
          <div className="h-3 bg-gray-200 rounded animate-pulse w-1/4" />
        </div>
      </div>
    </div>
  );
}

/**
 * Main content component for the Anime Gallery.
 * Handles fetching, filtering, sorting, and displaying anime cards.
 */
function AnimeGalleryContent() {
  const [animeList, setAnimeList] = useState<AnimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("popularity");
  const [order, setOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRangeIndex, setSelectedRangeIndex] = useState(0);
  const [isDifficultyOpen, setIsDifficultyOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const debouncedSearch = useDebounceValue(search, 500);

  const router = useRouter();
  const searchParams = useSearchParams();

  // States for filtering
  const [viewMode, setViewMode] = useState<"all" | "saved">(
    searchParams.get("view") === "saved" ? "saved" : "all",
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [excludeSaved, setExcludeSaved] = useState(false);

  const ITEMS_PER_PAGE = 24;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [sort, order, debouncedSearch, selectedRangeIndex]);

  // Sync view mode with URL params
  useEffect(() => {
    const view = searchParams.get("view") === "saved" ? "saved" : "all";
    setViewMode(view);
  }, [searchParams]);

  // Fetch anime data
  useEffect(() => {
    const fetchAnime = async () => {
      setLoading(true);
      try {
        const range = DIFFICULTY_RANGES[selectedRangeIndex];
        const query = new URLSearchParams({
          sort: viewMode === "saved" && sort === "popularity" ? "status" : sort, // Default sort for saved
          order,
          skip: ((page - 1) * ITEMS_PER_PAGE).toString(),
          limit: ITEMS_PER_PAGE.toString(),
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(range.min !== null && { min_score: range.min.toString() }),
          ...(range.max !== null && { max_score: range.max.toString() }),
        });

        let url = `${process.env.NEXT_PUBLIC_API_URL}/anime/?${query}`;
        const token = Cookies.get("token");
        const headers: any = {};

        // Use authenticated endpoint if token exists to get user statuses (watching, etc.)
        if (token) {
          url = `${process.env.NEXT_PUBLIC_API_URL}/anime/library?${query}`;
          headers["Authorization"] = `Bearer ${token}`;

          if (viewMode === "saved") {
            query.set("filter_mode", "saved_only");
            if (statusFilter !== "all") query.set("status", statusFilter);
          } else if (excludeSaved) {
            query.set("filter_mode", "exclude_saved");
          }
          // Reconstruct url with new params
          url = `${process.env.NEXT_PUBLIC_API_URL}/anime/library?${query}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();

        if (Array.isArray(data)) {
          setAnimeList(data);
        } else {
          console.error("API returned non-array:", data);
          setAnimeList([]);
        }
      } catch (err) {
        console.error(err);
        setAnimeList([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAnime();
  }, [
    sort,
    order,
    debouncedSearch,
    page,
    viewMode,
    excludeSaved,
    statusFilter,
    selectedRangeIndex,
  ]);

  /**
   * Renders a badge for the user's watch status (e.g., Watching, Completed).
   */
  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const styles: Record<string, string> = {
      watching: "bg-green-500 text-white",
      plan_to_watch: "bg-blue-500 text-white",
      completed: "bg-indigo-500 text-white",
      dropped: "bg-red-500 text-white",
    };
    const labels: Record<string, string> = {
      watching: "Watching",
      plan_to_watch: "Plan",
      completed: "Completed",
      dropped: "Dropped",
    };
    return (
      <span
        className={`absolute top-2 right-2 z-20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide rounded shadow-sm ${
          styles[status] || "bg-gray-500 text-white"
        }`}
      >
        {labels[status] || status}
      </span>
    );
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
        <div className="w-full lg:w-auto">
          <h1 className="text-3xl font-bold text-gray-900">
            {viewMode === "saved" ? "Saved Anime" : "All Anime"}
          </h1>
          <p className="text-gray-500 mt-2">
            Browse anime by vocabulary difficulty.
          </p>

          {/* Sub Filters */}
          <div className="flex flex-col gap-3 mt-4">
            {viewMode === "all" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600">
                <input
                  type="checkbox"
                  checked={excludeSaved}
                  onChange={(e) => setExcludeSaved(e.target.checked)}
                  className="rounded text-blue-600"
                />
                Hide Saved Anime
              </label>
            )}

            {viewMode === "saved" && (
              <div className="flex gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "watching", label: "Watching" },
                  { id: "plan_to_watch", label: "Plan to Watch" },
                  { id: "completed", label: "Completed" },
                  { id: "dropped", label: "Dropped" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === tab.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* Search */}
          <input
            type="text"
            placeholder="Search title..."
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Difficulty Filter */}
          <div className="relative">
            {isDifficultyOpen && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsDifficultyOpen(false)}
              ></div>
            )}
            <button
              onClick={() => setIsDifficultyOpen(!isDifficultyOpen)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 flex items-center gap-2 min-w-[200px] justify-between shadow-sm"
            >
              <span className="truncate">
                {DIFFICULTY_RANGES[selectedRangeIndex].label}
              </span>
              <span className="text-xs text-gray-500">▼</span>
            </button>

            {isDifficultyOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1 max-h-96 overflow-auto">
                {DIFFICULTY_RANGES.map((range, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedRangeIndex(index);
                      setIsDifficultyOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                      selectedRangeIndex === index
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Controls */}
          <div className="relative">
            {isSortOpen && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsSortOpen(false)}
              ></div>
            )}
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 flex items-center gap-2 min-w-40 justify-between shadow-sm"
            >
              <span className="truncate">
                {sort === "status" && "Sort by Status"}
                {sort === "difficulty" && "Sort by Difficulty"}
                {sort === "words" && "Sort by Word Count"}
                {sort === "title" && "Sort by Title"}
                {sort === "popularity" && "Sort by Popularity"}
                {sort === "anilist_rating" && "Sort by Rating"}
              </span>
              <span className="text-xs text-gray-500">▼</span>
            </button>

            {isSortOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
                {viewMode === "saved" && (
                  <button
                    onClick={() => {
                      setSort("status");
                      setIsSortOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 whitespace-nowrap ${
                      sort === "status"
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    Sort by Status
                  </button>
                )}
                {[
                  { val: "difficulty", label: "Sort by Difficulty" },
                  { val: "words", label: "Sort by Word Count" },
                  { val: "title", label: "Sort by Title" },
                  { val: "popularity", label: "Sort by Popularity" },
                  { val: "anilist_rating", label: "Sort by Rating" },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => {
                      setSort(opt.val);
                      setIsSortOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 whitespace-nowrap ${
                      sort === opt.val
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 font-mono"
          >
            {order === "asc" ? "ASC" : "DESC"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({
            length:
              animeList.length || (viewMode === "saved" ? 6 : ITEMS_PER_PAGE),
          }).map((_, i) => (
            <AnimeSkeleton key={i} />
          ))}
        </div>
      ) : animeList.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <div className="text-4xl mb-3">📭</div>
          <h3 className="text-lg font-medium text-gray-900">No anime found</h3>
          <p className="text-gray-500 mt-1 max-w-md mx-auto">
            {viewMode === "saved"
              ? "You haven't added any anime to your list yet. Start browsing to add some."
              : "There are no anime matching your search criteria."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {animeList.map((anime) => (
            <Link
              key={anime.id}
              href={`/anime/${anime.id}`}
              className="block group bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition relative hover:z-10"
            >
              <div className="aspect-2/3 bg-gray-100 relative overflow-hidden rounded-t-xl">
                {getStatusBadge(anime.user_status)}
                {anime.thumbnail_url ? (
                  <img
                    src={anime.thumbnail_url}
                    alt={anime.title_jp}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">
                    📺
                  </div>
                )}
              </div>

              <div className="p-4 flex flex-col grow">
                <h3 className="font-bold text-base text-gray-900 group-hover:text-blue-600 transition line-clamp-2 mb-1">
                  {anime.title_jp}
                </h3>
                {anime.title_en && (
                  <p className="text-xs text-gray-500 line-clamp-1 mb-3">
                    {anime.title_en}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  {anime.anilist_rating && (
                    <span
                      className="flex items-center gap-1"
                      title="AniList Rating"
                    >
                      <span className="text-yellow-500">★</span>{" "}
                      {anime.anilist_rating}%
                    </span>
                  )}
                  {anime.popularity && (
                    <span
                      className="flex items-center gap-1"
                      title="Popularity"
                    >
                      <span>👥</span> {anime.popularity.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="mt-auto">
                  <DifficultyBadge score={anime.ml_difficulty} size="small" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={animeList.length < ITEMS_PER_PAGE}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700"
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}

/**
 * Anime Gallery Page.
 * Wraps the content in Suspense to handle search params safely.
 */
export default function AnimeGallery() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-20 text-gray-500">
          Loading library...
        </div>
      }
    >
      <AnimeGalleryContent />
    </Suspense>
  );
}
