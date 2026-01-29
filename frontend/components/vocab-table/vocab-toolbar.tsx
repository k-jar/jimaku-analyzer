"use client";

import { useState } from "react";

interface VocabToolbarProps {
  totalCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  minFreq: number | "";
  maxFreq: number | "";
  onMinFreqChange: (value: number | "") => void;
  onMaxFreqChange: (value: number | "") => void;
  hideSaved: boolean;
  onHideSavedChange: (value: boolean) => void;
  selectedLevel: string;
  onLevelChange: (value: string) => void;
  isLoggedIn: boolean;
  showSaveActions: boolean;
  showDeleteAction: boolean;
  hasItems: boolean;
  onSaveAll: () => void;
  onDeleteAll: () => void;
  onExport: (type: "csv" | "txt") => void;
}

export function VocabToolbar({
  totalCount,
  searchQuery,
  onSearchChange,
  minFreq,
  maxFreq,
  onMinFreqChange,
  onMaxFreqChange,
  hideSaved,
  onHideSavedChange,
  selectedLevel,
  onLevelChange,
  isLoggedIn,
  showSaveActions,
  showDeleteAction,
  hasItems,
  onSaveAll,
  onDeleteAll,
  onExport,
}: VocabToolbarProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isLevelOpen, setIsLevelOpen] = useState(false);

  return (
    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 gap-4">
      <div className="text-gray-500 font-medium">{totalCount} words</div>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          className="border border-gray-300 rounded px-3 py-1 text-sm"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        {/* Frequency Range */}
        <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-2 py-1">
          <span className="text-xs text-gray-500">Freq:</span>
          <input
            type="number"
            placeholder="Min"
            className="w-16 text-sm text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={minFreq}
            onChange={(e) =>
              onMinFreqChange(e.target.value ? Number(e.target.value) : "")
            }
          />
          <span className="text-gray-400">-</span>
          <input
            type="number"
            placeholder="Max"
            className="w-16 text-sm text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={maxFreq}
            onChange={(e) =>
              onMaxFreqChange(e.target.value ? Number(e.target.value) : "")
            }
          />
        </div>

        {/* Hide Saved */}
        {isLoggedIn && showSaveActions && (
          <label className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={hideSaved}
              onChange={(e) => onHideSavedChange(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            Hide Saved
          </label>
        )}

        {/* Level Filter Dropdown */}
        <LevelDropdown
          isOpen={isLevelOpen}
          onToggle={() => setIsLevelOpen(!isLevelOpen)}
          onClose={() => setIsLevelOpen(false)}
          selectedLevel={selectedLevel}
          onSelect={onLevelChange}
        />

        {/* Export Dropdown */}
        <ExportDropdown
          isOpen={isExportOpen}
          onToggle={() => setIsExportOpen(!isExportOpen)}
          onClose={() => setIsExportOpen(false)}
          onExport={(type) => {
            onExport(type);
            setIsExportOpen(false);
          }}
        />

        {/* Save All Button */}
        {isLoggedIn && showSaveActions && (
          <button
            onClick={onSaveAll}
            className="border border-blue-300 text-blue-700 rounded px-3 py-1 text-sm bg-blue-50 hover:bg-blue-100 transition-colors"
            title="Save all words matching current filters"
          >
            Save All
          </button>
        )}

        {/* Delete All Button */}
        {showDeleteAction && hasItems && (
          <button
            onClick={onDeleteAll}
            className="border border-red-300 text-red-700 rounded px-3 py-1 text-sm bg-red-50 hover:bg-red-100 transition-colors"
            title="Delete all words matching current filters"
          >
            Delete All
          </button>
        )}
      </div>
    </div>
  );
}

// Level Filter Dropdown
function LevelDropdown({
  isOpen,
  onToggle,
  onClose,
  selectedLevel,
  onSelect,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  selectedLevel: string;
  onSelect: (level: string) => void;
}) {
  return (
    <div className="relative">
      {isOpen && <div className="fixed inset-0 z-10" onClick={onClose}></div>}
      <button
        onClick={onToggle}
        className="border border-gray-300 rounded px-3 py-1 text-sm bg-white hover:bg-gray-50 flex items-center gap-1 min-w-[100px] justify-between"
      >
        {selectedLevel ? `N${selectedLevel}` : "All Levels"}{" "}
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-20 py-1">
          <button
            onClick={() => {
              onSelect("");
              onClose();
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            All Levels
          </button>
          {[5, 4, 3, 2, 1].map((level) => (
            <button
              key={level}
              onClick={() => {
                onSelect(level.toString());
                onClose();
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              N{level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Export Dropdown
function ExportDropdown({
  isOpen,
  onToggle,
  onClose,
  onExport,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onExport: (type: "csv" | "txt") => void;
}) {
  return (
    <div className="relative">
      {isOpen && <div className="fixed inset-0 z-10" onClick={onClose}></div>}
      <button
        onClick={onToggle}
        className="border border-gray-300 rounded px-3 py-1 text-sm bg-white hover:bg-gray-50"
      >
        Export <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-20 py-1">
          <button
            onClick={() => onExport("csv")}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Anki CSV
          </button>
          <button
            onClick={() => onExport("txt")}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Plain Text
          </button>
        </div>
      )}
    </div>
  );
}
