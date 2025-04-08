/**
 * Feature items configuration
 * Uses translation keys from our type-safe Dictionary
 */
export const featureItems = [
  {
    id: 1,
    titleKey: "whatWeDo.feature1.title",
    descKey: "whatWeDo.feature1.description",
    fallbackTitle: "Feature 1",
    fallbackDesc: "Description for feature 1",
  },
  {
    id: 2,
    titleKey: "whatWeDo.feature2.title",
    descKey: "whatWeDo.feature2.description",
    fallbackTitle: "Feature 2",
    fallbackDesc: "Description for feature 2",
  },
  {
    id: 3,
    titleKey: "whatWeDo.feature3.title",
    descKey: "whatWeDo.feature3.description",
    fallbackTitle: "Feature 3",
    fallbackDesc: "Description for feature 3",
  },
] as const;

// Type for a feature item
export interface FeatureItem {
  id: number;
  titleKey: string;
  descKey: string;
  fallbackTitle: string;
  fallbackDesc: string;
}
