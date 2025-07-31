/**
 * Salesforce API types for contacts, accounts, and opportunities
 */

/**
 * Salesforce OAuth token response
 */
export interface SalesforceTokenResponse {
  access_token: string;
  refresh_token: string;
  signature: string;
  scope: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
}

/**
 * Salesforce API query response structure
 */
export interface SalesforceQueryResponse<T> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

/**
 * Salesforce Contact (Individual donor)
 */
export interface SalesforceContact {
  Id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone?: string;
  MobilePhone?: string;
  MailingStreet?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingPostalCode?: string;
  MailingCountry?: string;
  AccountId?: string;
  Title?: string;
  Department?: string;
  Description?: string;
  CreatedDate: string;
  LastModifiedDate: string;
  IsDeleted: boolean;
}

/**
 * Salesforce Account (Organization or Household)
 */
export interface SalesforceAccount {
  Id: string;
  Name: string;
  Type?: string;
  Phone?: string;
  Website?: string;
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  Description?: string;
  NumberOfEmployees?: number;
  AnnualRevenue?: number;
  CreatedDate: string;
  LastModifiedDate: string;
  IsDeleted: boolean;
}

/**
 * Salesforce error response
 */
export interface SalesforceError {
  message: string;
  errorCode: string;
  fields?: string[];
}

/**
 * Salesforce API error array
 */
export type SalesforceErrorResponse = SalesforceError[];

/**
 * Salesforce describe field response
 */
export interface SalesforceFieldDescription {
  name: string;
  type: string;
  label: string;
  length?: number;
  precision?: number;
  scale?: number;
  referenceTo?: string[];
  nillable?: boolean;
  createable?: boolean;
  updateable?: boolean;
}

/**
 * Salesforce describe object response
 */
export interface SalesforceDescribeResponse {
  name: string;
  label: string;
  fields: SalesforceFieldDescription[];
  createable: boolean;
  updateable: boolean;
  deletable: boolean;
  queryable: boolean;
}

/**
 * Salesforce Gift Transaction (Nonprofit Cloud Object)
 */
export interface SalesforceGiftTransaction {
  Id: string;
  Name: string;
  DonorId: string; // Reference to Account (the donor)
  Amount?: number; // Writable amount field for insert/update
  CurrentAmount?: number; // Read-only calculated field
  OriginalAmount?: number; // Original donation amount
  TransactionDate?: string; // Date of the transaction
  GiftDate?: string; // Using GiftDate instead of TransactionDate
  CheckDate?: string; // Alternative date field
  Status?: string; // Payment status (e.g., 'Paid', 'Pending')
  GiftType?: string; // Type of gift (e.g., 'Individual', 'Corporate')
  Description?: string;
  CampaignId?: string;
  PaymentMethod?: string; // e.g., 'Check', 'Credit Card', 'Unknown'
  CreatedDate: string;
  LastModifiedDate: string;
  IsDeleted: boolean;
}

/**
 * Salesforce Campaign
 */
export interface SalesforceCampaign {
  Id: string;
  Name: string;
  Description?: string;
  Status?: string;
  Type?: string;
  StartDate?: string;
  EndDate?: string;
  ExpectedRevenue?: number;
  ActualCost?: number;
  BudgetedCost?: number;
  ExpectedResponse?: number;
  IsActive?: boolean;
  ParentId?: string; // Reference to parent campaign
  CreatedDate: string;
  LastModifiedDate: string;
  IsDeleted: boolean;
}
