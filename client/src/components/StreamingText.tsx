interface Props {
  text: string;
  done: boolean;
  className?: string;
}

export default function StreamingText({ text, done, className = '' }: Props) {
  return (
    <div
      className={`font-mono text-sm whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-200 ${className}`}
    >
      {text}
      {!done && text && <span className="cursor-blink" />}
      {!text && !done && (
        <span className="text-gray-400 dark:text-gray-500 not-italic font-sans">
          Generating...
          <span className="cursor-blink" />
        </span>
      )}
    </div>
  );
}
