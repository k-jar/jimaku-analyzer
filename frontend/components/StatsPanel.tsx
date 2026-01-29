"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ExclusionTooltip from "./ExclusionTooltip";

/** Props for the StatsPanel component. */
interface StatsPanelProps {
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
  /** Optional user-specific statistics (e.g. known words coverage). */
  userStats?: {
    known_unique_count: number;
    known_unique_pct: number;
    comprehension_pct: number;
  } | null;
}

/**
 * StatsPanel Component.
 * Visualizes text analysis statistics using charts and data cards.
 * Displays vocabulary coverage, JLPT distribution, grammar breakdown, and readability metrics.
 */
export default function StatsPanel({ stats, userStats }: StatsPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!stats) return null;

  // --- DATA PREP ---

  // Prepare JLPT Data for Bar Chart
  const jlptDistribution = Object.entries(stats.jlpt_distribution)
    .filter(([key]) => key !== "Unknown")
    .map(([key, value]) => ({ name: key, count: value }));

  // Prepare POS (Part of Speech) Data for Pie Chart
  const posData = Object.entries(stats.pos_distribution).map(
    ([key, value]) => ({ name: key, value: value })
  );

  // Prepare General Vocabulary Thresholds for Table
  const thresholds = [
    { label: "70%", val: stats.general_vocab_thresholds["70"] },
    { label: "80%", val: stats.general_vocab_thresholds["80"] },
    { label: "90%", val: stats.general_vocab_thresholds["90"] },
    { label: "95%", val: stats.general_vocab_thresholds["95"] },
    { label: "97%", val: stats.general_vocab_thresholds["97"] },
    { label: "99%", val: stats.general_vocab_thresholds["99"] },
  ];

  // Prepare Local Vocabulary Data (specific to this text)
  const localData = stats.local_vocab_stats || [];

  // Helper to approximate threshold from curve if not provided explicitly
  const getLocalThreshold = (target: number) => {
    if (stats.local_vocab_thresholds?.[target.toString()]) {
      return stats.local_vocab_thresholds[target.toString()];
    }
    if (!localData.length) return 0;
    const found = localData.find((d) => d.coverage >= target);
    return found ? found.unique : 0;
  };

  const localThreshold95 = getLocalThreshold(95);
  const generalThreshold95 = stats.general_vocab_thresholds["95"] || 0;

  const localThresholds = [
    { label: "80%", val: getLocalThreshold(80) },
    { label: "90%", val: getLocalThreshold(90) },
    { label: "95%", val: getLocalThreshold(95) },
    { label: "99%", val: getLocalThreshold(99) },
  ].filter((t) => t.val > 0);

  // --- CHART CONFIGURATION ---

  const posColors: Record<string, string> = {
    Nouns: "#3b82f6",
    "Proper Nouns": "#8b5cf6",
    Verbs: "#ef4444",
    Adjectives: "#eab308",
    Particles: "#10b981",
    Auxiliary: "#6366f1",
    Conjunctions: "#f97316",
    Others: "#9ca3af",
  };

  const jlptColors: Record<string, string> = {
    N1: "#dc2626",
    N2: "#ea580c",
    N3: "#ca8a04",
    N4: "#16a34a",
    N5: "#2563eb",
    Unknown: "#9ca3af",
  };

  // --- DERIVED METRICS ---
  const sentenceCount = stats.detailed_stats?.sentence_count || 0;
  const wordsPerSentence =
    sentenceCount > 0 ? (stats.total_words / sentenceCount).toFixed(1) : null;
  const lexicalDiversity =
    stats.total_words > 0
      ? ((stats.unique_words / stats.total_words) * 100).toFixed(1)
      : null;
  const hapaxRatio =
    stats.unique_words > 0
      ? ((stats.unique_words_once / stats.unique_words) * 100).toFixed(1)
      : null;

  return (
    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* SUMMARY ROW */}
      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100 flex flex-wrap justify-around text-center items-center gap-y-4">
        {/* Series 95% */}
        <div className="relative group cursor-help">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wide text-blue-800">
            Series 95%
          </div>
          <div className="text-4xl font-bold text-blue-600 mt-1">
            {localThreshold95 ? localThreshold95.toLocaleString() : "-"}
          </div>
          <div className="text-[10px] text-gray-400">unique words needed</div>
          {/* Tooltip */}
          <ExclusionTooltip />
        </div>
        <div className="hidden md:block w-px h-12 bg-gray-200"></div>
        {/* General 95% */}
        <div>
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wide text-indigo-800">
            General 95%
          </div>
          <div className="text-4xl font-bold text-indigo-600 mt-1">
            {generalThreshold95 ? generalThreshold95.toLocaleString() : "-"}
          </div>
          <div className="text-[10px] text-gray-400">vocab size needed</div>
        </div>
        <div className="hidden md:block w-px h-12 bg-gray-200"></div>
        {/* Total Words */}
        <div className="relative group cursor-help">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wide">
            Total Words
          </div>
          <div className="text-4xl font-bold text-gray-800 mt-1">
            {stats.total_words.toLocaleString()}
          </div>
          {/* Tooltip */}
          <ExclusionTooltip />
        </div>
        <div className="hidden md:block w-px h-12 bg-gray-200"></div>
        {/* Unique Words */}
        <div className="relative group cursor-help">
          <div className="text-xs text-gray-500 uppercase font-bold">
            Unique Words
          </div>
          <div className="text-3xl font-bold text-gray-800 mt-1">
            {stats.unique_words.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats.unique_words_once} used once
          </div>
          {/* Tooltip */}
          <ExclusionTooltip />
        </div>
        <div className="hidden md:block w-px h-12 bg-gray-200"></div>
        {/* Unique Kanji */}
        <div>
          <div className="text-xs text-gray-500 uppercase font-bold">
            Unique Kanji
          </div>
          <div className="text-3xl font-bold text-indigo-600 mt-1">
            {stats.unique_kanji.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats.unique_kanji_once} used once
          </div>
        </div>
      </div>

      {/* USER STATS BANNER */}
      {userStats ? (
        <div className="lg:col-span-2 bg-blue-50 border border-blue-100 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-blue-900 font-bold text-lg">Your Progress</h4>
            <p className="text-blue-700 text-sm">
              You know{" "}
              <span className="font-bold">
                {userStats.known_unique_count.toLocaleString()}
              </span>{" "}
              unique words
              <span className="opacity-75 ml-1">
                ({userStats.known_unique_pct}%)
              </span>{" "}
              found in this work.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">
              {userStats.comprehension_pct}%
            </div>
            <div className="text-xs text-blue-500 font-medium uppercase tracking-wide">
              Expected Comprehension
            </div>
          </div>
        </div>
      ) : (
        <div className="lg:col-span-2 bg-gray-50 border border-gray-200 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-gray-700 font-bold text-lg">Your Progress</h4>
            <p className="text-gray-500 text-sm">
              <Link
                href="/login"
                className="text-blue-600 hover:underline font-medium"
              >
                Log in
              </Link>{" "}
              to see your vocabulary coverage and comprehension stats.
            </p>
          </div>
          <div className="text-right opacity-40 grayscale">
            <div className="text-3xl font-bold text-gray-400">--%</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Expected Comprehension
            </div>
          </div>
        </div>
      )}

      {/* SERIES/EPISODE COMPREHENSION (LOCAL) */}
      <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            Comprehension vs Unique Words Known
          </h3>
          <p className="text-xs text-gray-500">
            How many unique words from{" "}
            <strong>this specific series/episode</strong> you need to know to
            reach comprehension targets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left: Graph */}
          <div className="md:col-span-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={localData}
                margin={{ top: 10, right: 30, bottom: 20, left: 10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f0f0f0"
                />
                <XAxis
                  dataKey="unique"
                  type="number"
                  domain={[0, "auto"]}
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "Unique Words",
                    position: "insideBottom",
                    offset: -10,
                    fontSize: 10,
                    fill: "#666",
                  }}
                />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Comprehension"]}
                  labelFormatter={(label) => `Top ${label} Words`}
                />
                <Line
                  type="monotone"
                  dataKey="coverage"
                  stroke="#8b5cf6"
                  dot={false}
                  strokeWidth={3}
                  activeDot={{ r: 6 }}
                />

                {/* 95% Threshold Markers */}
                <ReferenceLine y={95} stroke="#10b981" strokeDasharray="3 3" />
                {localThreshold95 > 0 && (
                  <ReferenceLine
                    x={localThreshold95}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                  />
                )}

                {/* User Position */}
                {userStats && (
                  <ReferenceDot
                    x={userStats.known_unique_count}
                    y={userStats.comprehension_pct}
                    r={6}
                    fill="#2563eb"
                    stroke="white"
                    strokeWidth={2}
                  >
                    <Label
                      value="You"
                      position="top"
                      fill="#2563eb"
                      fontWeight="bold"
                      fontSize={12}
                    />
                  </ReferenceDot>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Right: Table */}
          <div className="border rounded-lg overflow-hidden h-fit">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Goal
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unique Words
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {localThresholds.map((t) => (
                  <tr key={t.label}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      {t.label}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-purple-600 font-mono">
                      {t.val?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* COMPREHENSION VS VOCABULARY SIZE */}
      <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            Comprehension vs Vocabulary Size
          </h3>
          <p className="text-xs text-gray-500">
            Vocabulary size required to understand the text. Shows how many
            words you need to know to reach comprehension targets. Based off of
            a JPDB frequency dictionary.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left: Graph */}
          <div className="md:col-span-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.general_vocab_stats}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="rank"
                  tickFormatter={(val) => `${val / 1000}k`}
                  style={{ fontSize: "10px" }}
                  type="number"
                  domain={[0, 30000]}
                  ticks={[0, 5000, 10000, 20000, 30000]}
                />
                <YAxis
                  domain={[0, 100]}
                  style={{ fontSize: "10px" }}
                  unit="%"
                  ticks={[0, 50, 80, 90, 100]}
                />
                <Tooltip
                  formatter={(val: number) => [`${val}%`, "Coverage"]}
                  labelFormatter={(label) => `Vocab Size: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="coverage"
                  stroke="#2563eb"
                  fill="#dbeafe"
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Right: Table */}
          <div className="border rounded-lg overflow-hidden h-fit">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Goal
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vocab Needed
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {thresholds.map((t) => (
                  <tr key={t.label}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      {t.label}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-blue-600 font-mono">
                      {typeof t.val === "number"
                        ? t.val >= 30000
                          ? "30,000+"
                          : t.val.toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* DETAILED STATS DROPDOWN */}
      <div className="lg:col-span-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-600 font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {showDetails ? "Hide Detailed Stats" : "Show Detailed Stats"}
          <span className="text-xs">{showDetails ? "▲" : "▼"}</span>
        </button>

        {showDetails && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TEXT STATS */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100 flex flex-wrap gap-8">
              {stats.detailed_stats && (
                <>
                  <div>
                    <div
                      className="text-xs text-gray-500 uppercase font-bold"
                      title="Average characters per sentence"
                    >
                      Avg Sentence Length
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                      {stats.detailed_stats.average_sentence_length || "-"}{" "}
                      <span className="text-sm font-normal text-gray-500">
                        chars
                      </span>
                    </div>
                  </div>
                  {wordsPerSentence && (
                    <div>
                      <div
                        className="text-xs text-gray-500 uppercase font-bold"
                        title="Average words per sentence"
                      >
                        Avg Words / Sentence
                      </div>
                      <div className="text-2xl font-bold text-gray-800">
                        {wordsPerSentence}{" "}
                        <span className="text-sm font-normal text-gray-500">
                          words
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold">
                      Sentence Count
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                      {stats.detailed_stats.sentence_count?.toLocaleString() ||
                        "-"}
                    </div>
                  </div>
                </>
              )}

              {lexicalDiversity && (
                <div>
                  <div
                    className="text-xs text-gray-500 uppercase font-bold"
                    title="Type-Token Ratio: Percentage of unique words vs total words. Higher means more diverse vocabulary."
                  >
                    Lexical Diversity
                  </div>
                  <div className="text-2xl font-bold text-gray-800">
                    {lexicalDiversity}%
                  </div>
                </div>
              )}
              {hapaxRatio && (
                <div>
                  <div
                    className="text-xs text-gray-500 uppercase font-bold"
                    title="Percentage of unique words that appear only once in the text."
                  >
                    Single-use Vocab
                  </div>
                  <div className="text-2xl font-bold text-gray-800">
                    {hapaxRatio}%
                  </div>
                </div>
              )}
              <div>
                <div
                  className="text-xs text-gray-500 uppercase font-bold"
                  title="Difficulty score based on jReadability (Legacy)"
                >
                  <a
                    href="https://github.com/joshdavham/jreadability"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 hover:underline"
                  >
                    Legacy Difficulty (JR)
                  </a>
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {stats.jr_difficulty?.toFixed(1) || "-"}
                </div>
              </div>
            </div>

            {/* JLPT DISTRIBUTION */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                JLPT Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jlptDistribution}>
                    <XAxis
                      dataKey="name"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {jlptDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={jlptColors[entry.name as string] || "#ccc"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GRAMMAR BREAKDOWN */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                Grammar Breakdown
              </h3>
              <div className="h-64">
                <div className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={posData}
                        cx="40%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {posData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={posColors[entry.name] || "#ccc"}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend
                        verticalAlign="middle"
                        align="right"
                        layout="vertical"
                        iconSize={20}
                        wrapperStyle={{ fontSize: "14px", fontWeight: 500 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatsPanelSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
      {/* SUMMARY ROW */}
      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100 flex flex-wrap justify-around gap-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2 w-32">
            <div className="h-3 bg-gray-200 rounded w-20"></div>
            <div className="h-8 bg-gray-200 rounded w-16"></div>
            <div className="h-2 bg-gray-200 rounded w-12"></div>
          </div>
        ))}
      </div>

      {/* COMPREHENSION ANALYSIS */}
      <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="mb-4 space-y-2">
          <div className="h-5 bg-gray-200 rounded w-48"></div>
          <div className="h-3 bg-gray-200 rounded w-full max-w-md"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 h-64 bg-gray-100 rounded"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>

      {/* JLPT DISTRIBUTION */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="h-5 bg-gray-200 rounded w-32 mb-4"></div>
        <div className="h-64 bg-gray-100 rounded"></div>
      </div>

      {/* GRAMMAR BREAKDOWN */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="h-5 bg-gray-200 rounded w-40 mb-4"></div>
        <div className="h-64 bg-gray-100 rounded"></div>
      </div>
    </div>
  );
}
