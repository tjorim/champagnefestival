/**
 * Contact information configuration
 * Store all contact-related information in this file
 * Values should be loaded from environment variables in production
 */

export const contactConfig = {
  // Email addresses
  emails: {
    // The email address that receives contact form submissions
    contact: 'nancy.cattrysse@telenet.be',
    // The email address used as sender for automated emails
    sender: 'nancy.cattrysse@telenet.be',
    // The email address for general information inquiries
    info: 'nancy.cattrysse@telenet.be',
  },
  
  // Phone numbers
  phones: {
    // Main contact phone number
    main: '+32 478 48 01 77',
  },
  
  // Social media handles
  social: {
    facebook: 'champagnefestival.kust',
  },
  
  // Location information
  location: {
    // Venue name
    venueName: 'Meeting- en eventcentrum Staf Versluys',
    // Full address
    address: 'Kapelstraat 76',
    // City
    city: 'Bredene',
    // Postal code
    postalCode: '8450',
    // Country
    country: 'België',
    // Opening hours are in the dictionary by language - this field not used directly
    openingHours: 'See schedule',
    // Map coordinates
    coordinates: {
      lat: 51.252562,
      lng: 2.974563,
    },
  },
};