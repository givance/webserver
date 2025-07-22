import { CrmDonor, CrmDonation } from '../base/types';
import { BlackbaudConstituent, BlackbaudGift } from './blackbaud.types';

/**
 * Maps Blackbaud data to our CRM data model
 */
export class BlackbaudMapper {
  /**
   * Map Blackbaud constituent to CRM donor
   */
  static mapConstituent(constituent: BlackbaudConstituent): CrmDonor {
    const isCouple = !!constituent.spouse?.first_name || !!constituent.spouse?.last_name;

    const donor: CrmDonor = {
      externalId: constituent.id,
      firstName: constituent.name?.first || '',
      lastName: constituent.name?.last || '',
      email: constituent.email?.address || '',
      phone: constituent.phone?.number,
      isCouple,
    };

    // Set display name
    if (constituent.name?.title || constituent.name?.suffix) {
      donor.displayName = [
        constituent.name.title,
        constituent.name.first,
        constituent.name.last,
        constituent.name.suffix,
      ]
        .filter(Boolean)
        .join(' ');
    }

    // Handle couple information
    if (isCouple && constituent.spouse) {
      donor.herFirstName = constituent.spouse.first_name;
      donor.herLastName = constituent.spouse.last_name;
      donor.hisFirstName = constituent.name?.first;
      donor.hisLastName = constituent.name?.last;

      // Create a couple display name
      const spouseName = [constituent.spouse.first_name, constituent.spouse.last_name]
        .filter(Boolean)
        .join(' ');
      const primaryName = [constituent.name?.first, constituent.name?.last]
        .filter(Boolean)
        .join(' ');

      if (spouseName && primaryName) {
        donor.displayName = `${primaryName} and ${spouseName}`;
      }
    }

    // Map address
    if (constituent.address) {
      donor.address = {
        street: [constituent.address.street1, constituent.address.street2]
          .filter(Boolean)
          .join(' '),
        city: constituent.address.city,
        state: constituent.address.state,
        postalCode: constituent.address.postal_code,
        country: constituent.address.country,
      };
    }

    // Store additional metadata
    donor.metadata = {
      type: constituent.type,
      lookupId: constituent.lookup_id,
      inactive: constituent.inactive,
      dateAdded: constituent.date_added,
      dateModified: constituent.date_modified,
    };

    return donor;
  }

  /**
   * Map Blackbaud gift to CRM donation
   */
  static mapGift(gift: BlackbaudGift): CrmDonation {
    const donation: CrmDonation = {
      externalId: gift.id,
      donorExternalId: gift.constituent_id,
      amount: Math.round(gift.amount.value * 100), // Convert to cents
      currency: 'USD', // Blackbaud doesn't provide currency in the response
      date: new Date(gift.date),
    };

    // Map designation
    if (gift.designation) {
      donation.designation = gift.designation.name;
    } else if (gift.fund) {
      donation.designation = gift.fund.description;
    }

    // Store additional metadata
    donation.metadata = {
      type: gift.type,
      giftStatus: gift.gift_status,
      isAnonymous: gift.is_anonymous,
      campaign: gift.campaign,
      fund: gift.fund,
      designation: gift.designation,
      dateAdded: gift.date_added,
      dateModified: gift.date_modified,
    };

    return donation;
  }
}
