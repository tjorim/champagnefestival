/**
 * Converts an array of flat row objects to a CSV string and triggers a browser download.
 *
 * - Values are double-quoted and internal double-quotes are escaped with `""`.
 * - A UTF-8 BOM is prepended so Excel opens the file correctly without an import wizard.
 * - Uses CRLF line endings as per RFC 4180.
 */
export function exportToCsv(
  filename: string,
  rows: Record<string, string | number | boolean | null | undefined>[],
): void {
  if (!rows.length) return;

  const firstRow = rows[0]!;
  const headers = Object.keys(firstRow);

  const escape = (value: string | number | boolean | null | undefined): string => {
    const str = String(value ?? "");
    // Prefix formula-injection characters so spreadsheet apps treat the value as text.
    const sanitized = /^[=+\-@\t\r\n]/.test(str) ? `'${str}` : str;
    return `"${sanitized.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];

  const csv = lines.join("\r\n");

  // UTF-8 BOM (\uFEFF) ensures Excel auto-detects the encoding correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Defer revocation so the browser has time to start the download.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
