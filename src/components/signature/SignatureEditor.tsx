"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Link as LinkIcon, 
  Image as ImageIcon,
  Code,
  List,
  ListOrdered,
  Undo,
  Redo,
  Type
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SignatureEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showCodeView?: boolean;
  onCodeViewChange?: (showCode: boolean) => void;
}

export function SignatureEditor({ 
  value, 
  onChange, 
  placeholder = "Enter your email signature...",
  className,
  showCodeView = false,
  onCodeViewChange
}: SignatureEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'signature-image'
        }
      }),
      Underline
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none min-h-[200px] px-3 py-2 focus:outline-none",
          "prose-headings:font-semibold prose-headings:text-foreground",
          "prose-p:text-foreground prose-p:leading-relaxed",
          "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
          "prose-strong:text-foreground prose-strong:font-semibold",
          "prose-ul:text-foreground prose-ol:text-foreground",
          "[&_img]:max-w-full [&_img]:h-auto"
        )
      }
    }
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const addLink = () => {
    const url = window.prompt("Enter URL:");
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();
    }
  };

  if (!editor) {
    return null;
  }

  if (showCodeView) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">HTML Code</span>
          {onCodeViewChange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCodeViewChange(false)}
            >
              Visual Editor
            </Button>
          )}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[200px] px-3 py-2 text-sm font-mono bg-muted rounded-md border resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows={10}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="border rounded-md">
        <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn("h-8 w-8 p-0", editor.isActive("bold") && "bg-muted")}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn("h-8 w-8 p-0", editor.isActive("italic") && "bg-muted")}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn("h-8 w-8 p-0", editor.isActive("underline") && "bg-muted")}
            title="Underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn("h-8 w-8 p-0", editor.isActive("heading", { level: 2 }) && "bg-muted")}
            title="Heading"
          >
            <Type className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={addLink}
            className={cn("h-8 w-8 p-0", editor.isActive("link") && "bg-muted")}
            title="Add Link"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={addImage}
            className="h-8 w-8 p-0"
            title="Add Image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn("h-8 w-8 p-0", editor.isActive("bulletList") && "bg-muted")}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn("h-8 w-8 p-0", editor.isActive("orderedList") && "bg-muted")}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="h-8 w-8 p-0"
            title="Undo"
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="h-8 w-8 p-0"
            title="Redo"
          >
            <Redo className="h-4 w-4" />
          </Button>
          
          {onCodeViewChange && (
            <>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCodeViewChange(true)}
                className="h-8 px-2"
                title="View HTML Code"
              >
                <Code className="h-4 w-4 mr-1" />
                HTML
              </Button>
            </>
          )}
        </div>
        
        <EditorContent 
          editor={editor} 
          className="min-h-[200px] max-h-[400px] overflow-y-auto"
        />
      </div>
      
      <p className="text-sm text-muted-foreground">
        Create a professional email signature with formatting, links, and images.
      </p>
    </div>
  );
}