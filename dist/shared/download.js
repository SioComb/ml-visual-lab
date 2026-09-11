// Callers own CSV serialization; this helper only downloads the supplied text.
export function downloadCSV(filename, csvString) {
  const url = URL.createObjectURL(
    new Blob([csvString], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
