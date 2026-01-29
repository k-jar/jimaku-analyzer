"use client";

import Cookies from "js-cookie";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import StatsPanel from "@/components/StatsPanel";
import { VocabTable } from "@/components/vocab-table";

/**
 * Represents a single token (word) analyzed from the text.
 */
interface TokenResult {
  surface: string;
  base: string;
  level: number | null;
  reading?: string;
  meanings?: string[];
  frequency?: number;
  kana_freq?: number;
  alternatives?: {
    word: string;
    reading: string;
    meanings: string[];
    level: number | null;
  }[];
}

/**
 * Represents the statistical breakdown of the analyzed text.
 */
interface AnalysisStats {
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
}

/**
 * The Text Analyzer page.
 * Allows users to input Japanese text or upload an image (OCR) to analyze vocabulary difficulty.
 */
export default function Home() {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState<TokenResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<number | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check for token on load
    const token = Cookies.get("token");
    if (token) setIsLoggedIn(true);
  }, []);

  /**
   * Triggers the hidden file input for image upload.
   */
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Handles image file selection and performs OCR via the backend.
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again if needed
    e.target.value = "";

    setIsOcrLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ocr`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("OCR Failed");

      const data = await res.json();
      setInputText(data.text);
      toast.success("Text extracted from image.");
    } catch (err) {
      console.error(err);
      toast.error("Could not read image.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  /**
   * Sends the input text to the backend for morphological analysis.
   */
  const analyzeText = async () => {
    if (!inputText) return;

    setIsLoading(true);
    try {
      const token = Cookies.get("token");
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Call the backend
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/analyze`,
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ text: inputText }),
        },
      );

      const data = await response.json();
      setResults(data.results);
      setStats(data.stats);
      setCurrentHistoryId(data.history_id);
    } catch (error) {
      console.error("Error analyzing text:", error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Returns the CSS class for coloring text based on JLPT level.
   */
  const getColorClass = (level: number | null) => {
    switch (level) {
      case 1:
        return "text-red-600 font-bold";
      case 2:
        return "text-orange-500 font-bold";
      case 3:
        return "text-yellow-600 font-bold";
      case 4:
        return "text-green-600";
      case 5:
        return "text-blue-600";
      default:
        return "text-gray-800";
    }
  };

  /**
   * Extracts a 3-sentence context window (Previous, Current, Next) around the target word.
   */
  const getContext = (fullText: string, targetWord: string) => {
    // Split text into sentences (naively by periods/newlines)
    const sentences = fullText
      .split(/(?<=。|\n)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Find which sentence contains the word
    const index = sentences.findIndex((s) => s.includes(targetWord));
    if (index === -1) return fullText.substring(0, 100); // Fallback

    // Grab Previous, Current, Next
    const prev = sentences[index - 1] || "";
    const curr = sentences[index];
    const next = sentences[index + 1] || "";

    return [prev, curr, next].join(" ").trim();
  };

  /**
   * Saves a word to the user's vocabulary list.
   */
  const saveWord = async (word: string) => {
    if (!isLoggedIn) {
      toast.error("Please login to save words.");
      return;
    }

    const token = Cookies.get("token");

    const contextSnippet = getContext(inputText, word);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/words/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          word: word,
          sentence: contextSnippet,
          history_id: currentHistoryId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message);
      } else {
        toast.error("Failed to save.");
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Text Analyzer</h1>
          <p className="text-gray-500 mt-2">
            Paste Japanese text or upload an image to analyze vocabulary
            difficulty.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isLoggedIn && (
            <Link
              href="/history"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition shadow-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span>History</span>
            </Link>
          )}
        </div>
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <textarea
          className="w-full p-4 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-lg leading-relaxed"
          rows={6}
          placeholder="Enter Japanese text here... (e.g. 日本語を勉強しています)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleUploadClick}
            disabled={isOcrLoading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
          >
            {isOcrLoading ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>📷</span> Upload Image
              </>
            )}
          </button>

          <button
            onClick={analyzeText}
            disabled={isLoading || !inputText.trim()}
            className="flex-1 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm"
          >
            {isLoading ? "Analyzing..." : "Analyze Text"}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <div className="space-y-8">
          {/* Text Display */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Analysis Result
              </h2>
              {/* Legend */}
              <div className="flex gap-3 text-xs font-medium">
                <span className="text-red-600">N1</span>
                <span className="text-orange-500">N2</span>
                <span className="text-yellow-600">N3</span>
                <span className="text-green-600">N4</span>
                <span className="text-blue-600">N5</span>
              </div>
            </div>

            <div className="p-6 bg-gray-50 rounded-lg text-lg leading-loose border border-gray-100">
              {results.map((token, index) => (
                <span
                  key={index}
                  className="inline-block mx-0.5 group relative cursor-pointer hover:bg-gray-200 rounded px-0.5 transition-colors"
                  onClick={() => saveWord(token.base)}
                >
                  <span className={getColorClass(token.level)}>
                    {token.surface}
                  </span>
                  {/* Tooltip */}
                  <div className="invisible group-hover:visible absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 mb-2 whitespace-nowrap z-20 shadow-xl border border-gray-700 min-w-[150px]">
                    {/* Tooltip Arrow */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-b border-r border-gray-700"></div>

                    <div className="font-bold text-base text-center text-white mb-0.5">
                      {token.base}
                    </div>
                    {token.reading && token.reading !== token.base && (
                      <div className="text-center text-xs text-gray-400 mb-2">
                        {token.reading}
                      </div>
                    )}
                    <div className="flex justify-between gap-4 text-[10px] text-gray-400 mb-2 pb-2 border-b border-gray-700">
                      <span
                        className={`font-bold ${
                          token.level ? "" : "text-gray-600"
                        }`}
                      >
                        {token.level ? `N${token.level}` : "N?"}
                      </span>
                      <span>
                        {token.frequency ? `Freq: #${token.frequency}` : "-"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {token.meanings?.slice(0, 3).map((m, i) => (
                        <div
                          key={i}
                          className="truncate max-w-[200px] text-gray-300"
                        >
                          • {m}
                        </div>
                      ))}
                    </div>
                    {token.alternatives && token.alternatives.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <div className="text-[10px] text-gray-500 mb-1">
                          Other forms:
                        </div>
                        {token.alternatives.slice(0, 2).map((alt, idx) => (
                          <div key={idx} className="mb-1 last:mb-0">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-yellow-500/80">
                                {alt.reading}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </span>
              ))}
            </div>
          </div>

          {stats && <StatsPanel stats={stats} />}

          <VocabTable
            tokens={results}
            onSave={saveWord}
            contextLabel="Text Analysis"
            initialSortBy="count"
            initialSortOrder="desc"
          />
        </div>
      ) : (
        !isLoading && (
          <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
            <div className="text-5xl mb-4 opacity-20">🇯🇵</div>
            <h3 className="text-lg font-medium text-gray-900">
              Ready to Analyze
            </h3>
            <p className="text-gray-500 mt-1">
              Paste Japanese text above or upload an image to get started.
            </p>
          </div>
        )
      )}
    </main>
  );
}
