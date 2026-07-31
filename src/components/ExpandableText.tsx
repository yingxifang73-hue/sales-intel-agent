import { PreservedStructuredText } from "./PreservedStructuredText";

export function ExpandableText({
  text,
  className,
}: {
  text: string;
  maxLength?: number;
  className?: string;
}) {
  if (!text) return <span className="field-gap">—</span>;
  return <PreservedStructuredText text={text} className={className} />;
}
