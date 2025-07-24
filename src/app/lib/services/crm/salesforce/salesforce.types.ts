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
 * Salesforce Opportunity (Donation)
 */
export interface SalesforceOpportunity {
  Id: string;
  Name: string;
  AccountId: string;
  ContactId?: string;
  Amount: number;
  CloseDate: string;
  StageName: string;
  Type?: string;
  Description?: string;
  CampaignId?: string;
  IsClosed: boolean;
  IsWon: boolean;
  Probability: number;
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
