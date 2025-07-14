'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Mail } from 'lucide-react';
import { SuggestedMemories } from '../../components/SuggestedMemories';
import ReactMarkdown from 'react-markdown';

interface ChatInterfaceProps {
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  suggestedMemories: string[];
  isChatCollapsed: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatInterface({
  chatMessages,
  suggestedMemories,
  isChatCollapsed,
  chatEndRef,
}: ChatInterfaceProps) {
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-3">
        {chatMessages.length === 0 ? (
          <div
            className={cn(
              'flex items-center justify-center min-h-[300px] transition-opacity duration-300',
              isChatCollapsed && 'opacity-0'
            )}
          >
            <div className="text-center text-muted-foreground">
              <div className="w-10 h-10 mx-auto bg-muted rounded-full flex items-center justify-center mb-2">
                <Mail className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">Start your email generation</p>
              <p className="text-[10px]">
                Write instructions below to generate personalized emails
              </p>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((message, index) => (
              <div
                key={index}
                className={cn('flex flex-col space-y-1', {
                  'items-end': message.role === 'user',
                })}
              >
                <div
                  className={cn('rounded-lg px-3 py-2 max-w-[85%]', {
                    'bg-primary text-primary-foreground': message.role === 'user',
                    'bg-muted': message.role === 'assistant',
                  })}
                >
                  {message.role === 'user' ? (
                    <p className="text-xs whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="text-xs prose prose-xs dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:my-2 [&>h2]:text-xs [&>h2]:font-bold [&>h2]:my-2 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:my-2 [&>ul]:list-disc [&>ul]:list-inside [&>ol]:list-decimal [&>ol]:list-inside [&>blockquote]:pl-2 [&>blockquote]:border-l-2 [&>blockquote]:border-muted-foreground/30 [&>blockquote]:my-1 [&_code]:px-1 [&_code]:py-0.5 [&_code]:bg-muted [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono [&>pre]:my-2 [&>pre]:p-2 [&>pre]:bg-muted [&>pre]:rounded [&>pre]:overflow-x-auto [&>pre]:text-[10px] [&_strong]:font-semibold [&_em]:italic">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="my-1">{children}</p>,
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside my-1">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside my-1">{children}</ol>
                          ),
                          li: ({ children }) => <li className="my-0">{children}</li>,
                          h1: ({ children }) => (
                            <h1 className="text-sm font-bold my-2">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-xs font-bold my-2">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-xs font-semibold my-2">{children}</h3>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">{children}</strong>
                          ),
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children }) => (
                            <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="my-2 p-2 bg-muted rounded overflow-x-auto text-[10px]">
                              {children}
                            </pre>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="pl-2 border-l-2 border-muted-foreground/30 my-1">
                              {children}
                            </blockquote>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                {message.role === 'assistant' &&
                  suggestedMemories.length > 0 &&
                  index === chatMessages.length - 1 && (
                    <div className="w-full mt-3">
                      <SuggestedMemories memories={suggestedMemories} />
                    </div>
                  )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </>
        )}
      </div>
    </ScrollArea>
  );
}
