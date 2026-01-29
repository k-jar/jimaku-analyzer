"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import ConfirmationDialog from "@/components/ConfirmationDialog";

/**
 * Represents a summary of a past analysis session.
 */
interface HistoryEntry {
  id: number;
  created_at: string;
  full_text: string;
  stats_snapshot: {
    total_words: number;
  };
}

/**
 * History Page.
 * Displays a list of past text analyses performed by the user.
 */
export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const router = useRouter();

  // Fetch history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      const token = Cookies.get("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/history/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) {
          if (res.status === 401) {
            Cookies.remove("token");
            router.push("/login");
          }
          return;
        }

        const data = await res.json();
        setHistory(data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [router]);

  /**
   * Opens the confirmation dialog for deleting a history entry.
   */
  const initiateDelete = (id: number) => {
    setDeleteId(id);
    setIsConfirmOpen(true);
  };

  /**
   * Executes the deletion of the selected history entry.
   */
  const confirmDelete = async () => {
    if (!deleteId) return;
    const token = Cookies.get("token");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/history/${deleteId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        setHistory(history.filter((h) => h.id !== deleteId));
        toast.success("Deleted");
      } else {
        toast.error("Failed to delete");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting history");
    } finally {
      setIsConfirmOpen(false);
      setDeleteId(null);
    }
  };

  if (loading)
    return (
      <div className="p-10 text-center text-gray-500">Loading history...</div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analysis History</h1>
        <Link href="/" className="text-blue-600 hover:underline font-medium">
          + New Analysis
        </Link>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500 mb-2">No history found.</p>
          <p className="text-sm text-gray-400">
            Analyses you perform while logged in will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col sm:flex-row justify-between gap-4"
            >
              <div className="grow">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-400">
                    {item.stats_snapshot.total_words} words
                  </span>
                </div>

                <Link
                  href={`/history/${item.id}`}
                  className="text-lg font-medium text-gray-800 hover:text-blue-600 line-clamp-2 leading-relaxed"
                >
                  {item.full_text}
                </Link>
              </div>

              <div className="flex items-start sm:items-center">
                <button
                  onClick={() => initiateDelete(item.id)}
                  className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Delete History"
        message="Are you sure you want to delete this analysis history? This action cannot be undone."
        confirmButtonText="Delete"
      />
    </div>
  );
}
