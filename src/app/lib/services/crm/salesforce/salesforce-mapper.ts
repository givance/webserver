import { CrmDonor, CrmDonation } from '../base/types';
import { SalesforceContact, SalesforceAccount, SalesforceOpportunity } from './salesforce.types';
import { logger } from '@/app/lib/logger';

/**
 * Maps Salesforce data to our internal CRM data model
 */
export class SalesforceMapper {
  /**
   * Map Salesforce Contact to CRM Donor
   */
  static mapContact(contact: SalesforceContact): CrmDonor {
    return {
      externalId: contact.Id,
      firstName: contact.FirstName || '',
      lastName: contact.LastName || '',
      displayName: `${contact.FirstName || ''} ${contact.LastName || ''}`.trim(),
      email: contact.Email || '',
      phone: contact.Phone || contact.MobilePhone || undefined,
      address: {
        street: contact.MailingStreet,
        city: contact.MailingCity,
        state: contact.MailingState,
        postalCode: contact.MailingPostalCode,
        country: contact.MailingCountry,
      },
      isCouple: false,
      metadata: {
        source: 'salesforce_contact',
        accountId: contact.AccountId,
        title: contact.Title,
        department: contact.Department,
        createdDate: contact.CreatedDate,
        lastModifiedDate: contact.LastModifiedDate,
      },
    };
  }

  /**
   * Map Salesforce Account to CRM Donor (for household/organization accounts)
   */
  static mapAccount(account: SalesforceAccount): CrmDonor {
    // Try to parse household names (e.g., "John and Jane Smith Household")
    const householdMatch = account.Name.match(/^(.+?)\s+and\s+(.+?)\s+(Household|Family)$/i);
    let isCouple = false;
    let hisFirstName: string | undefined;
    let herFirstName: string | undefined;
    let lastName: string | undefined;

    if (householdMatch) {
      isCouple = true;
      hisFirstName = householdMatch[1];
      herFirstName = householdMatch[2];
      // Extract last name from the pattern
      const lastNameMatch = householdMatch[2].match(/(\S+)$/);
      lastName = lastNameMatch ? lastNameMatch[1] : '';
    }

    return {
      externalId: account.Id,
      firstName: account.Name,
      lastName: '',
      displayName: account.Name,
      email: '', // Accounts typically don't have emails, need to get from related contacts
      phone: account.Phone,
      address: {
        street: account.BillingStreet,
        city: account.BillingCity,
        state: account.BillingState,
        postalCode: account.BillingPostalCode,
        country: account.BillingCountry,
      },
      isCouple,
      hisFirstName,
      herFirstName,
      hisLastName: isCouple ? lastName : undefined,
      herLastName: isCouple ? lastName : undefined,
      metadata: {
        source: 'salesforce_account',
        type: account.Type,
        website: account.Website,
        numberOfEmployees: account.NumberOfEmployees,
        annualRevenue: account.AnnualRevenue,
        createdDate: account.CreatedDate,
        lastModifiedDate: account.LastModifiedDate,
      },
    };
  }

  /**
   * Map Salesforce Opportunity to CRM Donation
   */
  static mapOpportunity(opportunity: SalesforceOpportunity): CrmDonation {
    // Only map closed-won opportunities as actual donations
    if (!opportunity.IsWon) {
      logger.debug('Skipping non-won opportunity', {
        id: opportunity.Id,
        stageName: opportunity.StageName,
      });
    }

    return {
      externalId: opportunity.Id,
      // Use either ContactId or AccountId as the donor reference
      donorExternalId: opportunity.ContactId || opportunity.AccountId,
      amount: Math.round(opportunity.Amount * 100), // Convert to cents
      currency: 'USD', // Salesforce doesn't provide currency in standard opportunity
      date: new Date(opportunity.CloseDate),
      designation: opportunity.Name, // Use opportunity name as designation
      metadata: {
        source: 'salesforce_opportunity',
        accountId: opportunity.AccountId,
        contactId: opportunity.ContactId,
        stageName: opportunity.StageName,
        type: opportunity.Type,
        campaignId: opportunity.CampaignId,
        probability: opportunity.Probability,
        isWon: opportunity.IsWon,
        createdDate: opportunity.CreatedDate,
        lastModifiedDate: opportunity.LastModifiedDate,
      },
    };
  }

  /**
   * Extract pagination info from Salesforce query response
   */
  static extractPaginationInfo(nextRecordsUrl?: string): string | undefined {
    if (!nextRecordsUrl) {
      return undefined;
    }

    // Extract the query locator from the URL
    // Format: /services/data/vXX.X/query/queryLocator
    const match = nextRecordsUrl.match(/\/query\/(.+)$/);
    return match ? match[1] : undefined;
  }
}
