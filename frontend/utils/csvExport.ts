export interface ExportWord {
  word: string;
  reading: string;
  meanings: string[];
  context?: string;
  level: number | null;
}

export const generateAnkiCSV = (words: ExportWord[]) => {
  const header = "# Word,Reading,Meanings,Context,Tags";
  const rows = words.map((w) => {
    // Escape quotes in content
    const cleanWord = w.word.replace(/"/g, '""');
    const cleanReading = (w.reading || "").replace(/"/g, '""');
    // Join meanings with <br> for Anki readability
    const cleanMeaning = (w.meanings || []).join("<br>").replace(/"/g, '""');
    const cleanContext = (w.context || "").replace(/"/g, '""');
    const tag = w.level ? `N${w.level}` : "";

    // Wrap in quotes
    return `"${cleanWord}","${cleanReading}","${cleanMeaning}","${cleanContext}","${tag}"`;
  });

  // Combine rows
  return [header, ...rows].join("\n");
};

export const generatePlainText = (words: ExportWord[]) => {
  return words.map((w) => w.word).join("\n");
};

export const downloadFile = (
  content: string,
  filename: string,
  contentType: string
) => {
  const blob = new Blob([content], { type: contentType });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
