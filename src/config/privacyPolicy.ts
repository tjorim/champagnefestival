/**
 * Privacy Policy Configuration
 * 
 * This file contains all the privacy policy content and structure.
 * Extracting content here allows for:
 * - Easier content updates without touching component logic
 * - Better separation of concerns
 * - Potential future dynamic content loading
 * - Consistent content structure across the application
 */

export interface PrivacyPolicySection {
  titleKey: string;
  fallbackTitle: string;
  contentKey: string;
  fallbackContent: string;
}

export interface PrivacyPolicyConfig {
  lastUpdatedKey: string;
  fallbackLastUpdated: string;
  lastUpdatedDateKey: string;
  fallbackLastUpdatedDate: string;
  introKey: string;
  fallbackIntro: string;
  sections: PrivacyPolicySection[];
}

export const privacyPolicyConfig: PrivacyPolicyConfig = {
  lastUpdatedKey: 'privacy.lastUpdated',
  fallbackLastUpdated: 'Last Updated',
  lastUpdatedDateKey: 'privacy.lastUpdatedDate',
  fallbackLastUpdatedDate: 'January 1, 2025',
  introKey: 'privacy.intro',
  fallbackIntro: 'Welcome to the Champagne Festival website. This Privacy Policy explains how we collect, use, and protect your personal information when you use our website and services.',
  
  sections: [
    {
      titleKey: 'privacy.dataCollection.title',
      fallbackTitle: 'Information We Collect',
      contentKey: 'privacy.dataCollection.content',
      fallbackContent: 'We collect information that you provide directly to us, such as when you contact us through the form on our website, sign up for our newsletter, or register for our events.'
    },
    {
      titleKey: 'privacy.dataUse.title',
      fallbackTitle: 'How We Use Your Information',
      contentKey: 'privacy.dataUse.content',
      fallbackContent: 'We use the information we collect to operate, maintain, and provide the features and functionality of our website, to process your requests, and to communicate with you about events and updates.'
    },
    {
      titleKey: 'privacy.dataProtection.title',
      fallbackTitle: 'How We Protect Your Information',
      contentKey: 'privacy.dataProtection.content',
      fallbackContent: 'We implement appropriate security measures to protect against unauthorized access to or unauthorized alteration, disclosure, or destruction of data.'
    },
    {
      titleKey: 'privacy.cookies.title',
      fallbackTitle: 'Cookies and Tracking Technologies',
      contentKey: 'privacy.cookies.content',
      fallbackContent: 'We use cookies and similar tracking technologies to track activity on our website and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.'
    },
    {
      titleKey: 'privacy.contactUs.title',
      fallbackTitle: 'Contact Us',
      contentKey: 'privacy.contactUs.content',
      fallbackContent: 'If you have any questions about this Privacy Policy, please contact us using the contact form on our website.'
    }
  ]
};