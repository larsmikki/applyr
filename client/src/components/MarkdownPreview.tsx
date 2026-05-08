import { useMemo } from 'react';
import { marked } from 'marked';

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownPreview({ content, className = '' }: Props) {
  const html = useMemo(() => {
    if (!content) return '';
    const result = marked.parse(content);
    if (typeof result === 'string') return result;
    return '';
  }, [content]);

  return (
    <div
      className={`prose prose-gray dark:prose-invert max-w-none prose-sm sm:prose-base
        prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100
        prose-h1:text-xl prose-h1:leading-snug
        prose-h2:text-lg prose-h2:leading-snug
        prose-h3:text-base prose-h3:leading-snug
        prose-h4:text-sm prose-h4:leading-snug
        prose-p:text-gray-700 dark:prose-p:text-gray-300
        prose-li:text-gray-700 dark:prose-li:text-gray-300
        prose-strong:text-gray-900 dark:prose-strong:text-gray-100
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
