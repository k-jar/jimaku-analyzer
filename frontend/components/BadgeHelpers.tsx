/**
 * Returns the Tailwind CSS classes for a given JLPT level badge.
 */
export const getBadgeColor = (level: number | null) => {
  switch (level) {
    case 1:
      return "bg-red-100 text-red-800 border-red-200";
    case 2:
      return "bg-orange-100 text-orange-800 border-orange-200";
    case 3:
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case 4:
      return "bg-green-100 text-green-800 border-green-200";
    case 5:
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

/**
 * Renders a badge indicating the frequency rank of a word (e.g., Core, Common, Rare).
 */
export const FrequencyBadge = ({ rank }: { rank?: number }) => {
  if (!rank) return <span className="text-gray-400 text-xs">-</span>;

  let label = "";
  let color = "";

  if (rank <= 3000) {
    label = "Core";
    color = "bg-purple-100 text-purple-800 border-purple-200";
  } else if (rank <= 10000) {
    label = "Common";
    color = "bg-blue-100 text-blue-800 border-blue-200";
  } else if (rank <= 15000) {
    label = "Uncommon";
    color = "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (rank <= 30000) {
    label = "Rare";
    color = "bg-amber-50 text-amber-700 border-amber-200";
  } else {
    label = "Obscure";
    color = "bg-gray-100 text-gray-500 border-gray-200";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}
    >
      {label}
      <span className="ml-1 text-[10px] opacity-75">#{rank}</span>
    </span>
  );
};
