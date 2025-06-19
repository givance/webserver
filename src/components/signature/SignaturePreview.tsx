"use client";

import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePreviewProps {
  signature: string;
  staffName?: string;
  className?: string;
}

export function SignaturePreview({ signature, staffName = "Staff Member", className }: SignaturePreviewProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState("");

  useEffect(() => {
    // Configure DOMPurify to allow safe HTML elements and attributes
    const config = {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'img', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'span', 'div'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'width', 'height', 
        'target', 'rel', 'class', 'style'
      ],
      ALLOWED_PROTOCOLS: ['http', 'https', 'mailto', 'tel'],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target', 'rel'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    };

    // Sanitize the HTML
    const clean = DOMPurify.sanitize(signature, config);
    
    // Add target="_blank" and rel="noopener noreferrer" to all links
    const div = document.createElement('div');
    div.innerHTML = clean;
    div.querySelectorAll('a').forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    
    setSanitizedHtml(div.innerHTML);
  }, [signature]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email Signature Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-background rounded-lg border p-4 space-y-4">
          {/* Mock email content */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This is how your signature will appear at the end of emails:
            </p>
            <div className="border-t pt-4">
              <p className="text-sm mb-4">
                Thank you for your continued support of our organization. 
                Your generosity makes a real difference in our community.
              </p>
              
              {/* Signature preview */}
              {signature ? (
                <div 
                  className={cn(
                    "prose prose-sm max-w-none",
                    "prose-headings:font-semibold prose-headings:text-foreground prose-headings:mb-2 prose-headings:mt-4",
                    "prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-2",
                    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                    "prose-strong:text-foreground prose-strong:font-semibold",
                    "prose-ul:text-foreground prose-ol:text-foreground prose-ul:my-2 prose-ol:my-2",
                    "prose-li:text-foreground prose-li:my-0",
                    "[&_img]:max-w-full [&_img]:h-auto [&_img]:my-2",
                    "[&_p:first-child]:mt-0",
                    "[&_*:last-child]:mb-0"
                  )}
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  <p>Best,</p>
                  <p>{staffName}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {!signature && (
          <p className="text-sm text-muted-foreground mt-3">
            No signature set. A default signature will be used.
          </p>
        )}
      </CardContent>
    </Card>
  );
}