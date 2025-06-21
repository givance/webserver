import { db } from "@/app/lib/db";
import { signatureImages } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { imageId: string } }) {
  try {
    const imageId = parseInt(params.imageId);

    if (isNaN(imageId)) {
      return new NextResponse("Invalid image ID", { status: 400 });
    }

    // Get the image from database
    const [image] = await db.select().from(signatureImages).where(eq(signatureImages.id, imageId)).limit(1);

    if (!image) {
      return new NextResponse("Image not found", { status: 404 });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image.base64Data, "base64");

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
    console.error("Error serving signature image:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
