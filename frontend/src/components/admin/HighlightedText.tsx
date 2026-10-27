/** Renders `text` with the part matching `query` emphasised, so a search result shows why it matched. */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLocaleLowerCase();
  const start = needle ? text.toLocaleLowerCase().indexOf(needle) : -1;
  if (start < 0) return <>{text}</>;
  const end = start + needle.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-transparent font-semibold text-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
