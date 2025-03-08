import { getDictionary, Dictionary } from '@/lib/i18n';
import { cache } from 'react';
import { contactConfig } from '@/app/config/contact';
import { festivalDate, festivalEndDate } from '@/app/config/dates';
import { getEventsByDay } from '@/app/config/schedule';

/**
 * Fetch dictionary data for a specific language
 * Using React's cache function to deduplicate requests
 */
export const getDictionaryData = cache(async (lang: string): Promise<Dictionary> => {
  const dictionary = await getDictionary(lang);
  return dictionary;
});

/**
 * Fetch carousel items for a specific type (producers or sponsors)
 * This would be replaced with a real API call in production
 */
export const getCarouselItems = cache(async (type: 'producers' | 'sponsors') => {
  // Mock data - in a real app, this would fetch from an API or database
  if (type === 'producers') {
    return [
      { id: 1, name: "Veuve Clicquot", image: "https://placehold.co/600x400?text=Veuve+Clicquot" },
      { id: 2, name: "Moët & Chandon", image: "https://placehold.co/600x400?text=Moët+%26+Chandon" },
      { id: 3, name: "Dom Pérignon", image: "https://placehold.co/600x400?text=Dom+Pérignon" },
      { id: 4, name: "Bollinger", image: "https://placehold.co/600x400?text=Bollinger" },
    ];
  } else {
    return [
      { id: 1, name: "Luxury Hotels Group", image: "https://placehold.co/600x400?text=Luxury+Hotels" },
      { id: 2, name: "Gourmet Foods Inc.", image: "https://placehold.co/600x400?text=Gourmet+Foods" },
      { id: 3, name: "Fine Wine Magazine", image: "https://placehold.co/600x400?text=Wine+Magazine" },
    ];
  }
});

/**
 * Fetch FAQ items
 * Uses the dictionary to get localized FAQs
 */
export const getFaqItems = cache(async (dictionary: Dictionary) => {
  // In a real app, you might fetch this from a CMS
  return [
    { 
      id: 1, 
      question: dictionary.faq.q1,
      answer: dictionary.faq.a1
    },
    { 
      id: 2, 
      question: dictionary.faq.q2,
      answer: dictionary.faq.a2
    },
    { 
      id: 3, 
      question: dictionary.faq.q3,
      answer: dictionary.faq.a3
    },
    { 
      id: 4, 
      question: dictionary.faq.q4,
      answer: dictionary.faq.a4
    },
    { 
      id: 5, 
      question: dictionary.faq.q5,
      answer: dictionary.faq.a5
    }
  ];
});

/**
 * Get event details in structured format
 * This could be used for SEO or display purposes
 */
export const getEventDetails = cache(async (dictionary: Dictionary) => {
  // Find the first and last event times from the schedule
  const firstDayEvents = getEventsByDay(1);
  const lastDayEvents = getEventsByDay(3);
  
  // Get opening time (earliest event on day 1)
  const earliestEvent = firstDayEvents.reduce((earliest, event) => {
    const currentTime = event.startTime;
    return earliest === '' || currentTime < earliest ? currentTime : earliest;
  }, '');
  
  // Get closing time (latest event on day 3)
  const latestEvent = lastDayEvents.reduce((latest, event) => {
    // Use endTime if available, otherwise use startTime
    const currentTime = event.endTime || event.startTime;
    return latest === '' || currentTime > latest ? currentTime : latest;
  }, '');
  
  // Create Date objects with the correct times
  const startDate = new Date(festivalDate);
  const endDate = new Date(festivalEndDate);
  
  // Parse times (assuming format HH:MM)
  if (earliestEvent) {
    const [hours, minutes] = earliestEvent.split(':').map(Number);
    startDate.setHours(hours, minutes, 0, 0);
  }
  
  if (latestEvent) {
    const [hours, minutes] = latestEvent.split(':').map(Number);
    endDate.setHours(hours, minutes, 0, 0);
  }
  
  return {
    name: `${dictionary.festivalName} ${festivalDate.getFullYear()}`,
    dates: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    location: {
      name: contactConfig.location.venueName,
      address: contactConfig.location.address,
      city: contactConfig.location.city,
      postalCode: contactConfig.location.postalCode,
      country: contactConfig.location.country,
      openingHours: contactConfig.location.openingHours,
      coordinates: contactConfig.location.coordinates
    },
    description: dictionary.welcome.subtitle,
  };
});