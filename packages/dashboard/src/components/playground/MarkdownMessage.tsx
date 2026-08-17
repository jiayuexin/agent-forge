import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
  inverted?: boolean;
}

export function MarkdownMessage({ content, inverted }: MarkdownMessageProps) {
  return (
    <div className={inverted ? 'text-white [&_*]:text-white' : 'prose prose-sm max-w-none'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
