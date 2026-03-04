import { m } from '../paraglide/messages';

/**
 * Privacy Policy Configuration
 */

export interface PrivacyPolicySection {
  getTitle: () => string;
  getContent: () => string;
}

export interface PrivacyPolicyConfig {
  getLastUpdated: () => string;
  getLastUpdatedDate: () => string;
  getIntro: () => string;
  sections: PrivacyPolicySection[];
}

export const privacyPolicyConfig: PrivacyPolicyConfig = {
  getLastUpdated: m.privacy_last_updated,
  getLastUpdatedDate: m.privacy_last_updated_date,
  getIntro: m.privacy_intro,

  sections: [
    {
      getTitle: m.privacy_data_collection_title,
      getContent: m.privacy_data_collection_content,
    },
    {
      getTitle: m.privacy_data_use_title,
      getContent: m.privacy_data_use_content,
    },
    {
      getTitle: m.privacy_data_protection_title,
      getContent: m.privacy_data_protection_content,
    },
    {
      getTitle: m.privacy_cookies_title,
      getContent: m.privacy_cookies_content,
    },
    {
      getTitle: m.privacy_contact_us_title,
      getContent: m.privacy_contact_us_content,
    },
  ],
};