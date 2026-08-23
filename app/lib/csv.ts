const dangerousCsvFormulaPrefixes = new Set(["=", "+", "-", "@"]);

export function safeCsvCell(value: unknown) {
  const rawValue = value === null || value === undefined ? "" : String(value);
  const trimmedLeft = rawValue.trimStart();
  const safeValue =
    trimmedLeft && dangerousCsvFormulaPrefixes.has(trimmedLeft[0])
      ? `'${rawValue}`
      : rawValue;

  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function toCsv(rows: readonly (readonly unknown[])[]) {
  return rows
    .map((row) => row.map((cell) => safeCsvCell(cell)).join(","))
    .join("\n");
}

