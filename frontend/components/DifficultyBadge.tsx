"use client";

import { getReadabilityLabel } from "@/utils/readability";

/**
 * Displays a color-coded badge representing the difficulty score of a text.
 * Includes a tooltip with a breakdown of the difficulty scale.
 */
export default function DifficultyBadge({
  score,
  size = "default",
}: {
  score: number;
  size?: "default" | "small" | "xs";
}) {
  const { label, color } = getReadabilityLabel(score);

  // Grading Scale Definition for the Tooltip
  const scale = [
    { range: "8.5 - 10.0", name: "Advanced", jlpt: "N1" },
    { range: "7.0 - 8.4", name: "Upper-Intermediate", jlpt: "N2 Hard" },
    { range: "5.0 - 6.9", name: "Intermediate", jlpt: "N2" },
    { range: "2.5 - 4.9", name: "Lower-Intermediate", jlpt: "N3 Hard" },
    { range: "1.0 - 2.4", name: "Pre-Intermediate", jlpt: "N3" },
    { range: "0.0 - 0.9", name: "Beginner", jlpt: "N4" },
  ];

  // Calculate JLPT based on difficulty score
  let jlpt = "N4";
  if (score >= 8.5) jlpt = "N1";
  else if (score >= 5.0) jlpt = "N2";
  else if (score >= 1.0) jlpt = "N3";
  // Else N4 (< 1.0)

  if (size === "xs") {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold ${color}`}
      >
        <span className="opacity-70 text-[10px]">★</span>
        {score.toFixed(1)}
      </div>
    );
  }

  const isSmall = size === "small";

  return (
    <div className="relative group/badge inline-block">
      {/* Badge*/}
      <div
        className={`flex items-center ${
          isSmall ? "gap-1.5 px-2 py-0.5" : "gap-2 px-3 py-1"
        } rounded-lg border cursor-help transition-all hover:shadow-sm ${color}`}
      >
        <div className="flex flex-col leading-none">
          {!isSmall && (
            <span className="text-[9px] uppercase font-bold opacity-70 tracking-wider">
              Difficulty
            </span>
          )}
          <div className="flex items-baseline gap-0.5">
            <span className={`${isSmall ? "text-sm" : "text-lg"} font-black`}>
              {score.toFixed(1)}
            </span>
            {!isSmall && (
              <span className="text-[10px] font-bold opacity-60">/ 10</span>
            )}
          </div>
        </div>

        {/* Vertical Divider */}
        <div
          className={`w-px bg-current opacity-20 ${isSmall ? "h-4" : "h-6"}`}
        ></div>

        {/* JLPT Section */}
        <div className={`font-bold ${isSmall ? "text-xs" : "text-lg"}`}>
          {jlpt}
        </div>

        {/* Vertical Divider */}
        <div
          className={`w-px bg-current opacity-20 ${isSmall ? "h-4" : "h-6"}`}
        ></div>

        <span
          className={`${
            isSmall ? "text-[10px]" : "text-xs"
          } font-bold leading-tight ${
            isSmall ? "max-w-[60px]" : "max-w-[80px]"
          }`}
        >
          {label}
        </span>
      </div>

      {/* Tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/badge:opacity-100 group-hover/badge:visible transition-all duration-200 group-hover/badge:delay-500 z-50 shadow-xl border border-gray-700">
        {/* Tooltip Arrow */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-t border-l border-gray-700"></div>

        <div className="font-bold text-gray-300 mb-2 border-b border-gray-700 pb-1 text-center">
          Difficulty Scale
        </div>

        <div className="space-y-1">
          {scale.map((tier) => (
            <div
              key={tier.name}
              className={`flex justify-between ${
                tier.name === label
                  ? "text-yellow-400 font-bold"
                  : "text-gray-400"
              }`}
            >
              <div className="flex gap-2">
                <span className="w-6 font-bold">{tier.jlpt}</span>
                <span>{tier.name}</span>
              </div>
              <span className="font-mono">{tier.range}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
