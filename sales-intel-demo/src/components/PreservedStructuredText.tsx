import { segmentPreservingText } from "@/lib/presentation-segments";

export function PreservedStructuredText({
  text,
  threshold = 96,
  className,
}: {
  text: string;
  threshold?: number;
  className?: string;
}) {
  const segments = segmentPreservingText(text, threshold);
  const classes = [
    "si-preserved-structured-text",
    segments.length > 1 ? "is-segmented" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <span className={classes} data-testid="preserved-structured-text">
      {segments.map((segment, index) => (
        <span data-testid="preserved-text-segment" key={`${index}-${segment.slice(0, 20)}`}>
          {segment}
        </span>
      ))}
    </span>
  );
}
