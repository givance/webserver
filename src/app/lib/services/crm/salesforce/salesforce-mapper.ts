import { CrmDonor, CrmDonation, CrmProject } from '../base/types';
import {
  SalesforceContact,
  SalesforceAccount,
  SalesforceGiftTransaction,
  SalesforceCampaign,
} from './salesforce.types';
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
   * Map Salesforce Gift Transaction to CRM Donation
   */
  static mapGiftTransaction(
    giftTransaction: SalesforceGiftTransaction | Record<string, unknown>
  ): CrmDonation {
    // Handle both typed and untyped gift transaction data
    const id = 'Id' in giftTransaction ? String(giftTransaction.Id) : '';
    const donorId = 'DonorId' in giftTransaction ? String(giftTransaction.DonorId) : '';
    const currentAmount =
      'CurrentAmount' in giftTransaction ? Number(giftTransaction.CurrentAmount) : 0;
    const name = 'Name' in giftTransaction ? String(giftTransaction.Name) : 'Gift Transaction';
    const transactionDate =
      'TransactionDate' in giftTransaction ? giftTransaction.TransactionDate : undefined;
    const giftDate = 'GiftDate' in giftTransaction ? giftTransaction.GiftDate : undefined;
    const checkDate = 'CheckDate' in giftTransaction ? giftTransaction.CheckDate : undefined;
    const createdDate = 'CreatedDate' in giftTransaction ? giftTransaction.CreatedDate : undefined;
    const campaignId = 'CampaignId' in giftTransaction ? giftTransaction.CampaignId : undefined;

    return {
      externalId: id,
      // GiftTransaction only has DonorId (Account reference)
      donorExternalId: donorId,
      amount: Math.round(currentAmount * 100), // Convert to cents
      currency: 'USD',
      date: transactionDate
        ? new Date(String(transactionDate))
        : checkDate
          ? new Date(String(checkDate))
          : giftDate
            ? new Date(String(giftDate))
            : createdDate
              ? new Date(String(createdDate))
              : new Date(),
      designation: name,
      campaignExternalId: campaignId ? String(campaignId) : undefined,
      metadata: {
        source: 'salesforce_gift_transaction',
        donorId: donorId,
        campaignId: campaignId,
        raw: giftTransaction,
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

  /**
   * Map Salesforce Campaign to CRM Project
   */
  static mapCampaign(campaign: SalesforceCampaign): CrmProject {
    return {
      externalId: campaign.Id,
      name: campaign.Name,
      description: campaign.Description,
      active: campaign.IsActive !== false, // Default to true if not specified
      goal: campaign.ExpectedRevenue ? Math.round(campaign.ExpectedRevenue * 100) : undefined, // Convert to cents
      tags: campaign.Type ? [campaign.Type] : undefined,
      metadata: {
        source: 'salesforce_campaign',
        status: campaign.Status,
        startDate: campaign.StartDate,
        endDate: campaign.EndDate,
        actualCost: campaign.ActualCost,
        budgetedCost: campaign.BudgetedCost,
        expectedResponse: campaign.ExpectedResponse,
        parentId: campaign.ParentId,
        createdDate: campaign.CreatedDate,
        lastModifiedDate: campaign.LastModifiedDate,
      },
    };
  }
}
