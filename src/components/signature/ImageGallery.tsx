"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { X, Image as ImageIcon } from "lucide-react";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageGalleryProps {
  onImageSelect: (dataUrl: string) => void;
  className?: string;
}

export function ImageGallery({ onImageSelect, className }: ImageGalleryProps) {
  const utils = trpc.useUtils();
  const { data: images, refetch } = trpc.users.getSignatureImages.useQuery();
  
  const deleteImageMutation = trpc.users.deleteSignatureImage.useMutation({
    onSuccess: () => {
      toast.success('Image deleted successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete image');
    },
  });

  const handleImageClick = async (imageId: number) => {
    try {
      const data = await utils.users.getSignatureImageData.fetch({ imageId });
      onImageSelect(data.dataUrl);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load image');
    }
  };

  const handleDeleteImage = (imageId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this image?')) {
      deleteImageMutation.mutate({ imageId });
    }
  };

  if (!images || images.length === 0) {
    return (
      <div className={cn("text-center py-6 text-muted-foreground", className)}>
        <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No uploaded images yet</p>
        <p className="text-xs">Upload an image to see it here</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium">Uploaded Images</h4>
      <div className="grid grid-cols-3 gap-2">
        {images.map((image) => (
          <div
            key={image.id}
            className="group relative aspect-square border rounded-lg overflow-hidden cursor-pointer hover:border-primary transition-colors"
            onClick={() => handleImageClick(image.id)}
          >
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => handleDeleteImage(image.id, e)}
              disabled={deleteImageMutation.isPending}
            >
              <X className="h-3 w-3" />
            </Button>
            
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">
              {image.filename}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}