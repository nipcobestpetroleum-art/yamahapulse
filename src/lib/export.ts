function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type CsvCellValue = string | number | boolean | null | undefined;
export type CsvRow = CsvCellValue[];

/**
 * Builds a CSV string (with BOM so Excel opens UTF-8 correctly).
 */
export function toCsvString(headers: string[], rows: CsvRow[]): string {
  const lines = [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(filename: string, headers: string[], rows: CsvRow[]): void {
  const blob = new Blob([toCsvString(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function timestampSlug(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
