/**
 * Blackbaud Sky API types
 */

export interface BlackbaudConstituent {
  id: string;
  type: string;
  lookup_id?: string;
  inactive: boolean;
  name?: {
    first?: string;
    last?: string;
    middle?: string;
    title?: string;
    suffix?: string;
  };
  email?: {
    address: string;
    type?: string;
    primary?: boolean;
  };
  phone?: {
    number: string;
    type?: string;
    primary?: boolean;
  };
  address?: {
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    type?: string;
    primary?: boolean;
  };
  spouse?: {
    first_name?: string;
    last_name?: string;
  };
  date_added?: string;
  date_modified?: string;
}

export interface BlackbaudGift {
  id: string;
  type: string;
  constituent_id: string;
  amount: {
    value: number;
  };
  date: string;
  gift_status: string;
  is_anonymous: boolean;
  designation?: {
    id: string;
    name: string;
  };
  fund?: {
    id: string;
    description: string;
  };
  campaign?: {
    id: string;
    description: string;
  };
  date_added?: string;
  date_modified?: string;
}

export interface BlackbaudListResponse<T> {
  count: number;
  next_link?: string;
  value: T[];
}

export interface BlackbaudCampaign {
  id: string;
  description: string;
  lookup_id?: string;
  start_date?: string;
  end_date?: string;
  goal?: number;
  inactive?: boolean;
  date_added?: string;
  date_modified?: string;
}

export interface BlackbaudTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope?: string;
}
