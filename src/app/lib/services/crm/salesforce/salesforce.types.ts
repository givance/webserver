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
  CurrentAmount?: number; // Using CurrentAmount instead of Amount
  GiftDate?: string; // Using GiftDate instead of TransactionDate
  Status?: string;
  GiftType?: string; // Using GiftType instead of Type
  Description?: string;
  CampaignId?: string;
  PaymentMethod?: string;
  CreatedDate: string;
  LastModifiedDate: string;
  IsDeleted: boolean;
}
