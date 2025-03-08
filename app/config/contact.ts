/**
 * Contact information configuration
 * Store all contact-related information in this file
 * Values should be loaded from environment variables in production
 */

export const contactConfig = {
  // Email addresses
  emails: {
    // The email address that receives contact form submissions
    contact: process.env.CONTACT_EMAIL || 'nancy.cattrysse@telenet.be',
    // The email address used as sender for automated emails
    sender: process.env.SENDER_EMAIL || 'nancy.cattrysse@telenet.be',
    // The email address for general information inquiries
    info: process.env.INFO_EMAIL || 'nancy.cattrysse@telenet.be',
  },
  
  // Phone numbers
  phones: {
    // Main contact phone number
    main: process.env.MAIN_PHONE || '+32 478 48 01 77',
  },
  
  // Social media handles
  social: {
    facebook: process.env.FACEBOOK_HANDLE || 'champagnefestival.kust',
  },
  
  // Location information
  location: {
    // Venue name
    venueName: process.env.VENUE_NAME || 'Meeting- en eventcentrum Staf Versluys',
    // Full address
    address: process.env.VENUE_ADDRESS || 'Kapelstraat 76',
    // City
    city: process.env.VENUE_CITY || 'Bredene',
    // Postal code
    postalCode: process.env.VENUE_POSTAL_CODE || '8450',
    // Country
    country: process.env.VENUE_COUNTRY || 'België',
    // Opening hours are in the dictionary by language - this field not used directly
    openingHours: process.env.VENUE_OPENING_HOURS || 'See schedule',
    // Map coordinates
    coordinates: {
      lat: process.env.VENUE_LAT ? parseFloat(process.env.VENUE_LAT) : 51.252562,
      lng: process.env.VENUE_LNG ? parseFloat(process.env.VENUE_LNG) : 2.974563,
    },
  },
};