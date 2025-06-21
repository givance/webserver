import { db } from "@/app/lib/db";
import { signatureImages } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const resolvedParams = await params;
    const imageId = parseInt(resolvedParams.imageId);

    console.log(`[SIGNATURE IMAGE] Request received for image ID: ${resolvedParams.imageId}`);

    if (isNaN(imageId)) {
      console.error(`[SIGNATURE IMAGE] Invalid image ID: ${resolvedParams.imageId}`);
      return new NextResponse("Invalid image ID", { status: 400 });
    }

    // Get the image from database
    const [image] = await db.select().from(signatureImages).where(eq(signatureImages.id, imageId)).limit(1);

    if (!image) {
      console.error(`[SIGNATURE IMAGE] Image not found for ID: ${imageId}`);
      return new NextResponse("Image not found", { status: 404 });
    }

    console.log(`[SIGNATURE IMAGE] Found image: ID=${image.id}, filename="${image.filename}", mimeType="${image.mimeType}", size=${image.size} bytes, organizationId="${image.organizationId}"`);

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image.base64Data, "base64");
    
    // Verify buffer size matches stored size
    if (imageBuffer.length !== image.size) {
      console.warn(`[SIGNATURE IMAGE] Buffer size mismatch: expected ${image.size}, got ${imageBuffer.length} for image ID ${imageId}`);
    }

    console.log(`[SIGNATURE IMAGE] Successfully serving image ID ${imageId} (${imageBuffer.length} bytes)`);

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": imageBuffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
        ETag: `"${image.id}-${image.updatedAt.getTime()}"`,
      },
    });
  } catch (error) {
    console.error(`[SIGNATURE IMAGE] Error serving signature image:`, error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
