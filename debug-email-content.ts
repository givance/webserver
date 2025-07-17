import { db } from './src/app/lib/db';
import { generatedEmails, donors } from './src/app/lib/db/schema';
import { eq, or } from 'drizzle-orm';

async function checkEmailContent() {
  try {
    console.log('Checking email content for emails 4985 and 4986...\n');

    // Query both emails
    const emails = await db
      .select({
        id: generatedEmails.id,
        donorId: generatedEmails.donorId,
        subject: generatedEmails.subject,
        emailContent: generatedEmails.emailContent,
        structuredContent: generatedEmails.structuredContent,
        reasoning: generatedEmails.reasoning,
        response: generatedEmails.response,
        updatedAt: generatedEmails.updatedAt,
        donor: {
          firstName: donors.firstName,
          lastName: donors.lastName,
        },
      })
      .from(generatedEmails)
      .leftJoin(donors, eq(generatedEmails.donorId, donors.id))
      .where(or(eq(generatedEmails.id, 4985), eq(generatedEmails.id, 4986)))
      .orderBy(generatedEmails.id);

    for (const email of emails) {
      console.log(`\n=== EMAIL ${email.id} ===`);
      console.log(`Donor: ${email.donor?.firstName} ${email.donor?.lastName}`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Updated At: ${email.updatedAt}`);
      console.log(`Email Content Length: ${email.emailContent?.length || 0} chars`);
      console.log(
        `Email Content Preview: ${email.emailContent ? email.emailContent.substring(0, 200) + '...' : 'null'}`
      );
      console.log(`Contains $ signs: ${email.emailContent?.includes('$') ? 'YES' : 'NO'}`);

      // Check if content contains dollar signs and log specific examples
      if (email.emailContent?.includes('$')) {
        const dollarMatches = email.emailContent.match(/\$[\d,]+/g);
        console.log(`Dollar amounts found: ${dollarMatches?.slice(0, 3).join(', ') || 'none'}`);
      }

      console.log(
        `Reasoning: ${email.reasoning ? email.reasoning.substring(0, 100) + '...' : 'null'}`
      );
      console.log(
        `Response: ${email.response ? email.response.substring(0, 100) + '...' : 'null'}`
      );
    }

    console.log('\n=== SUMMARY ===');
    if (emails.length === 2) {
      const email1 = emails[0];
      const email2 = emails[1];

      console.log(`Email ${email1.id} content length: ${email1.emailContent?.length || 0}`);
      console.log(`Email ${email2.id} content length: ${email2.emailContent?.length || 0}`);
      console.log(
        `Email ${email1.id} has $ signs: ${email1.emailContent?.includes('$') ? 'YES' : 'NO'}`
      );
      console.log(
        `Email ${email2.id} has $ signs: ${email2.emailContent?.includes('$') ? 'YES' : 'NO'}`
      );

      // Check if content is identical
      const contentMatch = email1.emailContent === email2.emailContent;
      console.log(`Content identical: ${contentMatch ? 'YES' : 'NO'}`);

      if (!contentMatch) {
        console.log('\n🔍 CONTENT DIFFERS - This explains the frontend inconsistency!');
      } else {
        console.log('\n✅ Content is identical - Issue must be in frontend/caching');
      }
    } else {
      console.log(`Found ${emails.length} emails (expected 2)`);
    }
  } catch (error) {
    console.error('Error checking email content:', error);
  } finally {
    process.exit(0);
  }
}

checkEmailContent();
