/**
 * Central configuration for festival dates
 * 
 * This file automatically calculates festival dates based on the rule:
 * "The first full weekend (Friday, Saturday, Sunday) of March and October"
 */

// Primary configuration - only update the year for future editions
export const FESTIVAL_CONFIG = {
  year: 2025
  // No hardcoded hours - these should come from the schedule
};

/**
 * Calculates the first Friday of a given month that is part of a full weekend
 * Returns an object with the Friday, Saturday, and Sunday dates
 */
function getFirstFullWeekend(year: number, month: number) {
  // Create a date for the 1st of the month
  const firstDay = new Date(year, month - 1, 1);
  
  // Get the day of the week for the 1st (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayOfWeek = firstDay.getDay();
  
  // Calculate days to add to get to the first Friday
  // If the 1st is a Friday (day 5), add 0 days
  // If the 1st is a Saturday (day 6), add 6 days to get to next Friday
  // If the 1st is a Sunday (day 0), add 5 days to get to Friday
  // and so on...
  let daysToAdd = 0;
  if (firstDayOfWeek <= 5) {
    // If the 1st is Sun-Fri, calculate days to the first Friday
    daysToAdd = 5 - firstDayOfWeek; // Friday is day 5
  } else {
    // If the 1st is Saturday, add 6 days to get to the next Friday
    daysToAdd = 5 + 7 - firstDayOfWeek;
  }
  
  // Create the first Friday
  const firstFriday = new Date(year, month - 1, 1 + daysToAdd);
  
  // Create the following Saturday and Sunday
  const firstSaturday = new Date(year, month - 1, 1 + daysToAdd + 1);
  const firstSunday = new Date(year, month - 1, 1 + daysToAdd + 2);
  
  return {
    friday: firstFriday,
    saturday: firstSaturday,
    sunday: firstSunday
  };
}

// Calculate March and October festival dates
const marchWeekend = getFirstFullWeekend(FESTIVAL_CONFIG.year, 3); // March
const octoberWeekend = getFirstFullWeekend(FESTIVAL_CONFIG.year, 10); // October

// Currently active festival edition (change this to switch between March/October)
const ACTIVE_EDITION = 'march'; // or 'october'

// Get the active weekend
const activeWeekend = ACTIVE_EDITION === 'march' ? marchWeekend : octoberWeekend;
const activeMonth = ACTIVE_EDITION === 'march' ? 3 : 10;

// Export festival start and end dates (without specific times)
// Times should be determined by the schedule, not here
export const festivalDate = new Date(activeWeekend.friday);

export const festivalEndDate = new Date(activeWeekend.sunday);

// Individual festival days
export const festivalDays = [
  activeWeekend.friday,
  activeWeekend.saturday, 
  activeWeekend.sunday
];

// Month names for different languages
const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  nl: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
};

// Helper function to generate localized date range strings
function generateDateRangeStrings() {
  // Convert JavaScript 0-indexed month to 1-indexed
  const month = activeMonth - 1; // 0-indexed for arrays
  const startDay = activeWeekend.friday.getDate();
  const endDay = activeWeekend.sunday.getDate();
  const year = FESTIVAL_CONFIG.year;
  
  return {
    en: `${MONTH_NAMES.en[month]} ${startDay}-${endDay}, ${year}`,
    fr: `${startDay}-${endDay} ${MONTH_NAMES.fr[month]} ${year}`,
    nl: `${startDay}-${endDay} ${MONTH_NAMES.nl[month]} ${year}`
  };
}

// Automatically generated formatted date strings for translations
export const FESTIVAL_DATE_RANGE = generateDateRangeStrings();
