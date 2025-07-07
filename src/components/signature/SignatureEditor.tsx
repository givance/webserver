'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Button } from '@/components/ui/button';
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
  Type,
  Upload,
  Copy,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/app/lib/trpc/client';
import { toast } from 'sonner';
import { ImageGallery } from './ImageGallery';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  placeholder = 'Enter your email signature...',
  className,
  showCodeView = false,
  onCodeViewChange,
}: SignatureEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [showImageGallery, setShowImageGallery] = useState(false);

  // tRPC mutations
  const uploadImageMutation = trpc.users.uploadSignatureImage.useMutation({
    onSuccess: (data) => {
      // Insert the image into the editor
      editor?.chain().focus().setImage({ src: data.dataUrl }).run();
      toast.success('Image uploaded successfully');
      setIsUploading(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to upload image');
      setIsUploading(false);
    },
  });

  // Helper function to handle file upload
  const handleFileUpload = useCallback(
    (file: File) => {
      if (!file) return;

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
        return;
      }

      // Validate file size (5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('File size too large. Maximum 5MB allowed.');
        return;
      }

      setIsUploading(true);

      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          // Extract base64 data (remove data:image/...;base64, prefix)
          const base64Data = result.split(',')[1];
          uploadImageMutation.mutate({
            filename: file.name,
            mimeType: file.type,
            base64Data,
            size: file.size,
          });
        }
      };
      reader.onerror = () => {
        toast.error('Failed to read file');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    },
    [uploadImageMutation, setIsUploading]
  );

  // Handle copy HTML functionality
  const handleCopyHTML = async () => {
    if (!editor) return;

    setCopyStatus('copying');
    try {
      const html = editor.getHTML();
      await navigator.clipboard.writeText(html);
      setCopyStatus('success');
      toast.success('HTML copied to clipboard');

      // Reset status after 2 seconds
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (error) {
      setCopyStatus('error');
      toast.error('Failed to copy HTML');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  // Handle image selection from gallery
  const handleImageSelect = (dataUrl: string) => {
    editor?.chain().focus().setImage({ src: dataUrl }).run();
    toast.success('Image inserted from gallery');
  };

  // Create a custom extension for handling image paste
  const imagePasteExtension = useMemo(() => {
    return Extension.create({
      name: 'imagePaste',

      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: new PluginKey('imagePaste'),
            props: {
              handlePaste(view, event) {
                const items = event.clipboardData?.items;
                if (!items) return false;

                // Debug: Log what's in the clipboard
                console.log(
                  'Clipboard items:',
                  Array.from(items).map((item) => ({ type: item.type, kind: item.kind }))
                );

                // Check for direct image files first (this works when using "Copy image")
                for (let i = 0; i < items.length; i++) {
                  const item = items[i];

                  if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    console.log('Found image item:', {
                      type: item.type,
                      kind: item.kind,
                      file: file ? { name: file.name, size: file.size, type: file.type } : null,
                    });

                    if (file && file.size > 0) {
                      event.preventDefault();
                      console.log('Processing image file:', file.name, file.type, file.size);

                      // Generate a filename for the pasted image
                      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                      const extension = file.type.split('/')[1] || 'png';
                      const filename = `copied-image-${timestamp}.${extension}`;

                      // Create a new file with the generated name
                      const namedFile = new File([file], filename, { type: file.type });

                      // Show immediate feedback
                      toast.success('Processing copied image...');
                      handleFileUpload(namedFile);
                      return true;
                    } else if (file) {
                      // File exists but size is 0 - this sometimes happens with Gmail
                      console.log('Image file found but size is 0 - trying to process anyway');
                      event.preventDefault();

                      // Try to process it anyway, sometimes it still works
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const result = e.target?.result as string;
                        if (result && result.length > 100) {
                          // Basic check for valid data
                          const base64Data = result.split(',')[1];
                          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                          const extension = item.type.split('/')[1] || 'png';
                          const filename = `copied-image-${timestamp}.${extension}`;

                          toast.info('Processing copied image...');
                          uploadImageMutation.mutate({
                            filename,
                            mimeType: item.type,
                            base64Data,
                            size: Math.round((base64Data.length * 3) / 4),
                          });
                        } else {
                          toast.error(
                            'Image data appears to be empty. Try right-clicking the image and selecting "Copy image" instead.'
                          );
                        }
                      };
                      reader.onerror = () => {
                        toast.error(
                          'Failed to read image data. Try right-clicking the image and selecting "Copy image".'
                        );
                      };
                      reader.readAsDataURL(file);
                      return true;
                    }
                  }
                }

                // Check for HTML content that might contain images
                for (let i = 0; i < items.length; i++) {
                  const item = items[i];

                  if (item.type === 'text/html') {
                    // Let the user know we're looking for images in HTML
                    item.getAsString((htmlString) => {
                      console.log('HTML content length:', htmlString.length);
                      console.log('HTML snippet:', htmlString.substring(0, 500));

                      // Look for base64 images in the HTML
                      const base64ImageRegex =
                        /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"/gi;
                      let match;
                      let foundImage = false;

                      while ((match = base64ImageRegex.exec(htmlString)) !== null) {
                        foundImage = true;
                        const mimeType = `image/${match[1]}`;
                        const base64Data = match[2];

                        console.log('Found base64 image:', mimeType, 'length:', base64Data.length);

                        // Generate filename
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const filename = `pasted-image-${timestamp}.${match[1]}`;

                        // Calculate approximate file size
                        const size = Math.round((base64Data.length * 3) / 4);

                        // Show feedback and upload
                        toast.info('Processing image from clipboard...');
                        uploadImageMutation.mutate({
                          filename,
                          mimeType,
                          base64Data,
                          size,
                        });

                        break; // Only process the first image found
                      }

                      if (!foundImage) {
                        // Look for external image URLs and try to fetch them
                        const imgRegex = /<img[^>]+src="([^"]+)"/gi;
                        const urlMatch = imgRegex.exec(htmlString);
                        if (urlMatch) {
                          const imageUrl = urlMatch[1].replace(/&amp;/g, '&'); // Decode HTML entities
                          console.log('Found external image URL:', imageUrl);

                          // Try to fetch the image
                          toast.info('Fetching image from URL...');

                          // Use a proxy approach or try direct fetch
                          fetch(imageUrl, {
                            mode: 'cors',
                            credentials: 'include', // Include cookies for authentication
                          })
                            .then((response) => {
                              if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                              }
                              return response.blob();
                            })
                            .then((blob) => {
                              // Convert blob to base64
                              const reader = new FileReader();
                              reader.onload = () => {
                                const result = reader.result as string;
                                const base64Data = result.split(',')[1];
                                const mimeType = blob.type || 'image/png';

                                // Generate filename
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const extension = mimeType.split('/')[1] || 'png';
                                const filename = `gmail-image-${timestamp}.${extension}`;

                                console.log('Successfully fetched image:', mimeType, blob.size);

                                uploadImageMutation.mutate({
                                  filename,
                                  mimeType,
                                  base64Data,
                                  size: blob.size,
                                });
                              };
                              reader.onerror = () => {
                                console.error('Failed to read fetched image blob');
                                toast.error('Failed to process fetched image');
                              };
                              reader.readAsDataURL(blob);
                            })
                            .catch((error) => {
                              console.error('Failed to fetch image:', error);
                              // Provide helpful instructions for Gmail images
                              if (imageUrl.includes('mail.google.com')) {
                                toast.error(
                                  'Gmail images cannot be copied directly. Try: 1) Right-click the image → "Copy image" → paste here, or 2) Right-click → "Save image as" → then upload the file.',
                                  {
                                    duration: 8000,
                                  }
                                );
                              } else {
                                toast.error(
                                  'Cannot fetch image from external URL. Please save the image and upload it directly.'
                                );
                              }
                            });
                        } else {
                          console.log('No images found in HTML content');
                        }
                      }
                    });

                    // Don't prevent default for HTML content unless we found a base64 image
                    return false;
                  }
                }

                return false; // Allow normal paste for other content
              },
            },
          }),
        ];
      },
    });
  }, [handleFileUpload, uploadImageMutation]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'signature-image',
          loading: 'eager',
          crossorigin: 'anonymous',
        },
      }),
      Underline,
      imagePasteExtension,
    ],
    content: value,
    onCreate: ({ editor }) => {
      // Ensure images are loaded after editor creation
      setTimeout(() => {
        const images = editor.view.dom.querySelectorAll('img');
        images.forEach((img: HTMLImageElement) => {
          if (img.src.startsWith('data:')) {
            // Force reload base64 images
            const src = img.src;
            img.src = '';
            requestAnimationFrame(() => {
              img.src = src;
            });
          }
        });
      }, 50);
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none min-h-[200px] px-3 py-2 focus:outline-none',
          'prose-headings:font-semibold prose-headings:text-foreground',
          'prose-p:text-foreground prose-p:leading-relaxed prose-p:my-0',
          'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
          'prose-strong:text-foreground prose-strong:font-semibold',
          'prose-ul:text-foreground prose-ol:text-foreground',
          '[&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block',
          // Reset default prose font styles to match app fonts
          '[&_*]:font-sans',
          'text-sm' // Match the default text size
        ),
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      // Temporarily disable update handler to prevent infinite loop
      const currentHTML = editor.getHTML();
      if (value !== currentHTML) {
        editor.commands.setContent(value);

        // Force reload images after content is set
        setTimeout(() => {
          const images = editor.view.dom.querySelectorAll('img');
          images.forEach((img: HTMLImageElement) => {
            // If it's a base64 image that failed to load, try to reload it
            if (img.src.startsWith('data:') && !img.complete) {
              const src = img.src;
              img.src = '';
              img.src = src;
            }
          });
        }, 100);
      }
    }
  }, [value, editor]);

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset the input value so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((file) => file.type.startsWith('image/'));

    if (imageFile) {
      handleFileUpload(imageFile);
    } else if (files.length > 0) {
      toast.error('Please drop an image file');
    }
  };

  if (!editor) {
    return null;
  }

  if (showCodeView) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">HTML Code</span>
          {onCodeViewChange && (
            <Button variant="ghost" size="sm" onClick={() => onCodeViewChange(false)}>
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
    <div className={cn('space-y-2', className)}>
      <div className="border rounded-md">
        <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn('h-8 w-8 p-0', editor.isActive('bold') && 'bg-muted')}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn('h-8 w-8 p-0', editor.isActive('italic') && 'bg-muted')}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn('h-8 w-8 p-0', editor.isActive('underline') && 'bg-muted')}
            title="Underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn('h-8 w-8 p-0', editor.isActive('heading', { level: 2 }) && 'bg-muted')}
            title="Heading"
          >
            <Type className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={addLink}
            className={cn('h-8 w-8 p-0', editor.isActive('link') && 'bg-muted')}
            title="Add Link"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImageClick}
            disabled={isUploading}
            className="h-8 w-8 p-0"
            title="Upload Image"
          >
            {isUploading ? (
              <div className="h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn('h-8 w-8 p-0', editor.isActive('bulletList') && 'bg-muted')}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn('h-8 w-8 p-0', editor.isActive('orderedList') && 'bg-muted')}
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

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyHTML}
            disabled={copyStatus === 'copying'}
            className="h-8 px-2"
            title="Copy HTML to Clipboard"
          >
            {copyStatus === 'copying' && (
              <div className="h-3 w-3 animate-spin border-2 border-current border-t-transparent rounded-full mr-1" />
            )}
            {copyStatus === 'success' && <Check className="h-3 w-3 mr-1 text-green-600" />}
            {copyStatus === 'error' && <X className="h-3 w-3 mr-1 text-red-600" />}
            {copyStatus === 'idle' && <Copy className="h-3 w-3 mr-1" />}
            Copy HTML
          </Button>

          {onCodeViewChange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCodeViewChange(true)}
              className="h-8 px-2 ml-1"
              title="View HTML Code"
            >
              <Code className="h-4 w-4 mr-1" />
              HTML
            </Button>
          )}
        </div>

        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="min-h-[200px] max-h-[400px] overflow-y-auto relative"
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Image Gallery */}
      <Collapsible open={showImageGallery} onOpenChange={setShowImageGallery}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between text-sm">
            <span>Uploaded Images</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', showImageGallery && 'rotate-180')}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <ImageGallery onImageSelect={handleImageSelect} />
        </CollapsibleContent>
      </Collapsible>

      <p className="text-sm text-muted-foreground">
        Create a professional email signature with formatting, links, and images. Upload images,
        paste them directly (Ctrl+V), or use previously uploaded ones from the gallery.
      </p>
    </div>
  );
}
