const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { donors, personResearch } = require('./src/app/lib/db/schema.js');
const { eq, and, sql } = require('drizzle-orm');
require('dotenv').config();

async function testHighPotentialColumn() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  const db = drizzle(pool);
  
  try {
    console.log('Testing high potential donor column...');
    
    // Test 1: Simple select with highPotentialDonor
    const result = await db
      .select({
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        highPotentialDonor: donors.highPotentialDonor,
      })
      .from(donors)
      .limit(1);
    
    console.log('Test 1 - Simple select result:', result[0]);
    
    // Test 2: With person research join
    const result2 = await db
      .select({
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        highPotentialDonor: donors.highPotentialDonor,
        highPotentialDonorRationale: sql`
          (${personResearch.researchData}->>'structuredData')::jsonb->>'highPotentialDonorRationale'
        `,
      })
      .from(donors)
      .leftJoin(personResearch, and(eq(personResearch.donorId, donors.id), eq(personResearch.isLive, true)))
      .limit(1);
    
    console.log('Test 2 - With person research join result:', result2[0]);
    
  } catch (error) {
    console.error('Error testing:', error);
  } finally {
    await pool.end();
  }
}

testHighPotentialColumn(); 