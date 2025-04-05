/**
 * FAQ configuration
 * 
 * This file defines the structure and keys for the FAQ section.
 * The actual question and answer content is stored in the translation files (dictionaries).
 * 
 * To add a new FAQ item:
 * 1. Add a new entry to this array with unique question and answer keys
 * 2. Add the corresponding content to all language dictionary files
 */
export const faqKeys = [
  { id: 1, questionKey: "q1", answerKey: "a1" }, // What is the Champagne Festival about?
  { id: 2, questionKey: "q2", answerKey: "a2" }, // When is the next festival?
  { id: 3, questionKey: "q3", answerKey: "a3" }, // Where will the festival be held?
  { id: 4, questionKey: "q4", answerKey: "a4" }, // Are tickets available yet?
  { id: 5, questionKey: "q5", answerKey: "a5" }, // Can I become a sponsor or vendor?
  // Add more FAQ items here as needed
];
