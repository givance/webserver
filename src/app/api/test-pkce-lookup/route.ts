import { NextRequest, NextResponse } from 'next/server';
import { getPKCEVerifier } from '@/app/lib/utils/pkce';
import { db } from '@/app/lib/db';
import { oauthPkceVerifiers } from '@/app/lib/db/schema';

export async function POST(request: NextRequest) {
  try {
    const { state } = await request.json();

    // Check database directly
    const directResult = await db.query.oauthPkceVerifiers.findFirst({
      where: (table, { eq }) => eq(table.state, state),
    });

    // Also try the utility function
    const utilityResult = await getPKCEVerifier(state);

    // Get all records for debugging
    const allRecords = await db.select().from(oauthPkceVerifiers).limit(5);

    return NextResponse.json({
      state: state.substring(0, 50) + '...',
      directDbResult: directResult
        ? {
            hasVerifier: true,
            verifierLength: directResult.verifier.length,
            expiresAt: directResult.expiresAt,
          }
        : null,
      utilityResult: utilityResult
        ? {
            hasVerifier: true,
            verifierLength: utilityResult.length,
          }
        : null,
      totalRecordsInDb: allRecords.length,
      sampleStates: allRecords.map((r) => r.state.substring(0, 20) + '...'),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
