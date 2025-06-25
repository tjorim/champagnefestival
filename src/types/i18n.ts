// Strongly typed dictionary structure based on our translations
export interface Dictionary {
  welcome: {
    title: string;
    subtitle: string;
    learnMore: string;
  };
  whatWeDo: {
    title: string;
    description: string;
    forEveryone: string;
    feature1: {
      title: string;
      description: string;
    };
    feature2: {
      title: string;
      description: string;
    };
    feature3: {
      title: string;
      description: string;
    };
  };
  nextFestival: {
    title: string;
    description: string;
  };
  schedule: {
    title: string;
    description: string;
    days: {
      friday: string;
      saturday: string;
      sunday: string;
    };
    categories: {
      tasting: string;
      vip: string;
      party: string;
      breakfast: string;
      exchange: string;
      general: string;
    };
    reservation: string;
    presenter: string;
    location: string;
    noEvents: string;
    events: {
      [eventId: string]: {
        title: string;
        description: string;
      };
    };
  };
  location: {
    title: string;
    venueDescription: string;
    address: string;
    openingHours: string;
    openingHoursValue: string;
    mapLabel: string;
    mapTitle: string;
  };
  countdown: {
    months: string;
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
    started: string;
    loading: string;
  };
  producers: {
    title: string;
  };
  sponsors: {
    title: string;
  };
  faq: {
    title: string;
    q1: string;
    a1: string;
    q2: string;
    a2: string;
    q3: string;
    a3: string;
    q4: string;
    a4: string;
    q5: string;
    a5: string;
  };
  contact: {
    title: string;
    intro: string;
    alternativeContact: string;
    emailLabel: string;
    phoneLabel: string;
    name: string;
    email: string;
    message: string;
    placeholderMessage: string;
    submitting: string;
    submit: string;
    successMessage: string;
    submissionError: string;
    networkError: string;
    errors: {
      nameRequired: string;
      emailRequired: string;
      emailInvalid: string;
      messageRequired: string;
      submissionTooFast: string;
      securityVerificationFailed: string;
      securityVerificationError: string;
      missingFields: string;
      invalidEmailServer: string;
      emailSendError: string;
      serverError: string;
    };
  };
  accessibility: {
    skipToContent: string;
  };
  festivalName: string;
  loading: string;
  loadingBackground: string;
  loadingProducers: string;
  loadingSponsors: string;
  error: string;
  footer: {
    rights: string;
    privacy: string;
    terms: string;
  };
  language: {
    select: string;
  };
  close: string;
  privacy: {
    title: string;
    lastUpdated: string;
    lastUpdatedDate: string;
    intro: string;
    dataCollection: {
      title: string;
      content: string;
    };
    dataUse: {
      title: string;
      content: string;
    };
    dataProtection: {
      title: string;
      content: string;
    };
    cookies: {
      title: string;
      content: string;
    };
    contactUs: {
      title: string;
      content: string;
    };
  };
}