export default function ExclusionTooltip() {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-56 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-xl border border-gray-700">
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-t border-l border-gray-700"></div>
      <div className="font-bold mb-2 text-gray-300 border-b border-gray-700 pb-1 text-center">
        Excluded from Count
      </div>
      <ul className="text-gray-400 space-y-1 text-left">
        <li className="flex items-start gap-2">
          <span className="text-gray-600">•</span> Particles
        </li>
        <li className="flex items-start gap-2">
          <span className="text-gray-600">•</span> Auxiliary Verbs
        </li>
        <li className="flex items-start gap-2">
          <span className="text-gray-600">•</span> Interjections
        </li>
        <li className="flex items-start gap-2">
          <span className="text-gray-600">•</span> Non-Japanese words
        </li>
        <li className="flex items-start gap-2">
          <span className="text-gray-600">•</span> No frequency rank
        </li>
      </ul>
    </div>
  );
}
