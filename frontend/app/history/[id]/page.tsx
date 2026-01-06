"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import StatsPanel from "@/app/components/StatsPanel"; // Reusing your existing component

/**
 * Represents the full details of a past analysis session.
 */
interface HistoryDetail {
  id: number;
  created_at: string;
  full_text: string;
  stats_snapshot: any; // Using 'any' because StatsPanel expects specific structure already matched
}

/**
 * History Detail Page.
 * Displays the full text and statistical analysis of a specific past session.
 */
export default function HistoryDetailPage() {
  const { id } = useParams();
  const [entry, setEntry] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Fetch details on mount
  useEffect(() => {
    const fetchDetail = async () => {
      const token = Cookies.get("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/history/${id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          toast.error("Entry not found");
          router.push("/history");
          return;
        }

        const data = await res.json();
        setEntry(data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load entry");
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id, router]);

  if (loading)
    return (
      <div className="p-10 text-center text-gray-500">Loading analysis...</div>
    );
  if (!entry) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header / Nav */}
      <div className="mb-6 flex items-center gap-4 text-sm text-gray-500">
        <Link href="/history" className="hover:text-gray-900">
          ← Back to History
        </Link>
        <span>•</span>
        <span>Analyzed on {new Date(entry.created_at).toLocaleString()}</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Analysis Snapshot
      </h1>

      {/* The Text Content */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mb-8">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">
          Original Text
        </h2>
        <div className="whitespace-pre-wrap leading-relaxed text-gray-800 text-lg">
          {entry.full_text}
        </div>
      </div>

      {/* The Stats Visualization */}
      <div className="border-t border-gray-200 pt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Statistics</h2>
        <StatsPanel stats={entry.stats_snapshot} />
      </div>
    </div>
  );
}
