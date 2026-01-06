import re
import io
from sudachipy import tokenizer, dictionary


class Analyzer:
    _tokenizer_obj = None
    _jp_pattern = re.compile(r"[\u3040-\u30ff\u4e00-\u9faf]")
    _ass_pattern = re.compile(r"\b[mlb]\s+[\-]?\d")

    def __init__(self):
        # Initialize Sudachi
        if Analyzer._tokenizer_obj is None:
            Analyzer._tokenizer_obj = dictionary.Dictionary().create()
        self.tokenizer_obj = Analyzer._tokenizer_obj
        self.mode = tokenizer.Tokenizer.SplitMode.C

    def get_tokens(self, text: str):
        """
        Tokenizes text and returns a list of dictionary forms.
        Handles large inputs by chunking them to avoid SudachiPy byte limits.
        """
        # Sudachi limit is ~49KB.
        MAX_BYTES = 40000

        results = []
        chunk = []
        current_bytes = 0

        # Safe character limit for splitting very long lines
        # 10000 chars * 4 bytes (max UTF8) = 40000 bytes <= MAX_BYTES
        SAFE_CHAR_LIMIT = 10000

        # Use StringIO to iterate line by line without creating a massive list
        buf = io.StringIO(text)

        try:
            for line_raw in buf:
                line = line_raw.rstrip("\r\n")
                # Filter out ASS drawing commands to prevent processing junk data
                if self._is_ass_drawing(line):
                    continue

                # +1 for the newline character that will be joined back
                line_bytes = len(line.encode("utf-8")) + 1

                # Handle extremely long lines that exceed the limit on their own
                if line_bytes > MAX_BYTES:
                    # Flush current chunk if it exists
                    if chunk:
                        results.extend(self._tokenize_chunk("\n".join(chunk)))
                        chunk = []
                        current_bytes = 0

                    # Split the long line into safe segments
                    for i in range(0, len(line), SAFE_CHAR_LIMIT):
                        segment = line[i : i + SAFE_CHAR_LIMIT]
                        results.extend(self._tokenize_chunk(segment))
                    continue

                # If adding this line exceeds the limit, process the current chunk
                if current_bytes + line_bytes > MAX_BYTES:
                    if chunk:
                        results.extend(self._tokenize_chunk("\n".join(chunk)))

                    # Reset chunk with the current line
                    chunk = [line]
                    current_bytes = line_bytes
                else:
                    chunk.append(line)
                    current_bytes += line_bytes

            # Process any remaining lines
            if chunk:
                results.extend(self._tokenize_chunk("\n".join(chunk)))
        except Exception as e:
            print(f"Error processing text: {e}")
            # print(lines)
            return []

        return results

    def _is_ass_drawing(self, line: str) -> bool:
        """
        Detects if a line is likely an ASS subtitle vector drawing command.
        """
        # If it contains Japanese characters, assume it's valid text
        if self._jp_pattern.search(line):
            return False

        # Check for vector drawing patterns (e.g., "m 0 0", "b -100 ...")
        # Matches "m", "l", "b" followed by a number
        if self._ass_pattern.search(line):
            return True

        return False

    def _tokenize_chunk(self, text: str):
        """
        Internal helper to process a single safe-sized chunk of text.
        """
        if not text.strip():
            return []

        tokens = self.tokenizer_obj.tokenize(text, self.mode)
        results = []

        for token in tokens:
            pos = token.part_of_speech()
            results.append(
                {
                    "surface": token.surface(),  # The provided text
                    "base": token.dictionary_form(),
                    "normalized": token.normalized_form(),
                    "pos": pos,
                }
            )

        return results
