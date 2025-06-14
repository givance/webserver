# WhatsApp AI Donor Query Feature

## Overview
This feature enables users to ask questions about donors via WhatsApp and receive AI-powered responses with real-time database information.

## How It Works
1. Users send WhatsApp messages to your organization's WhatsApp Business number
2. The system detects if the message is asking about donors using keyword matching
3. If it's a donor query, it processes the message with GPT-4.1 and database tools
4. The AI queries the database for relevant information and formats a response
5. The response is sent back to the user via WhatsApp

## Supported Query Types

### Find Donors
- "Find donors named John"
- "Search for Aaron"
- "Look up donors with email john@example.com"

### Donor Details
- "Tell me about John Smith"
- "Show me Aaron's information"
- "Get details for donor ID 123"

### Donation History
- "List Aaron's past donations"
- "Show John Smith's donation history"
- "What has Sarah donated?"

### Organization Statistics
- "What are our donation statistics?"
- "How many donors do we have?"
- "Show me our donation totals"

### Top Donors
- "Who are our top 5 donors?"
- "Show me our biggest contributors"
- "List the top 10 donors by amount"

## Configuration

### Organization Mapping
Currently uses a default organization ID. To configure:

1. Update `DEFAULT_ORGANIZATION_ID` in `src/app/api/whatsapp/webhook/route.ts`
2. Replace with your actual organization ID from the database

### Environment Variables
Ensure these are set in your environment:
- `AZURE_OPENAI_API_KEY` - Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT` - Your Azure OpenAI endpoint
- `AZURE_OPENAI_RESOURCE_NAME` - Your Azure OpenAI resource name
- `AZURE_OPENAI_DEPLOYMENT_NAME` - Your GPT-4.1 deployment name
- `WHATSAPP_TOKEN` - Your WhatsApp Business API token
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Your WhatsApp webhook verification token

### WhatsApp Webhook Setup
1. Set your webhook URL to: `https://yourdomain.com/api/whatsapp/webhook`
2. Configure WhatsApp Business API to send messages to this endpoint
3. Verify the webhook using the verification token

## Response Format
The AI formats responses to be WhatsApp-friendly:
- Donation amounts in dollars (e.g., "$1,234.56")
- Readable dates (e.g., "March 15, 2024")
- Organized lists for multiple results
- Concise, professional language

## Example Conversations

**User:** "Find donors named Aaron"
**Bot:** "I found 1 donor matching 'Aaron': Aaron Smith (aaron.smith@email.com) - $2,500.00 total donations across 3 contributions"

**User:** "Tell me about John Smith"
**Bot:** "John Smith has donated $1,234.56 across 5 donations, last donation on March 15, 2024. Contact: john@email.com, (555) 123-4567. Assigned to: Sarah Johnson"

**User:** "What are our donation statistics?"
**Bot:** "Your organization has 150 donors who have made 420 total donations worth $45,678.90. This includes 25 high-potential donors and 30 couples."

## Security & Privacy
- All database queries are scoped to the specific organization
- No sensitive information is logged in plain text
- Error messages don't expose internal system details
- WhatsApp API tokens are securely managed through environment variables

## Monitoring & Debugging
The system includes comprehensive logging:
- All queries and responses are logged
- Token usage tracking for cost monitoring
- Error handling with detailed logs
- WhatsApp API response monitoring

Check logs for:
- `[WhatsApp Webhook]` - Webhook processing
- `WhatsAppQueryToolsService` - Database queries
- `WhatsAppAIService` - AI processing

## Limitations
- Currently supports one default organization (TODO: implement phone number mapping)
- English language only
- Requires exact organization ID configuration
- WhatsApp rate limits apply

## Future Enhancements
- Multi-organization support with phone number mapping
- Multi-language support
- Rate limiting and usage controls
- Custom response templates
- Integration with other business systems
- Advanced donor analytics queries 