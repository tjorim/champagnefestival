import { describe, it, expect } from 'vitest';
import {
  festivalYear,
  festivalDate,
  festivalEndDate,
  festivalDays,
  festivalDateRange,
  activeEdition,
} from '@/config/dates';

describe('dates config', () => {
  it('exports the festival year', () => {
    expect(festivalYear).toBe(2025);
  });

  it('festival start date is a valid Date', () => {
    expect(festivalDate).toBeInstanceOf(Date);
    expect(isNaN(festivalDate.getTime())).toBe(false);
  });

  it('festival start is on a Friday', () => {
    // getDay() returns 5 for Friday
    expect(festivalDate.getDay()).toBe(5);
  });

  it('festival start time is set to 17:00', () => {
    expect(festivalDate.getHours()).toBe(17);
    expect(festivalDate.getMinutes()).toBe(0);
  });

  it('festival end date is a valid Date', () => {
    expect(festivalEndDate).toBeInstanceOf(Date);
    expect(isNaN(festivalEndDate.getTime())).toBe(false);
  });

  it('festival end date is a Sunday', () => {
    // getDay() returns 0 for Sunday
    expect(festivalEndDate.getDay()).toBe(0);
  });

  it('festival end date is after festival start date', () => {
    expect(festivalEndDate.getTime()).toBeGreaterThan(festivalDate.getTime());
  });

  it('exports three festival days (Fri, Sat, Sun)', () => {
    expect(festivalDays).toHaveLength(3);
  });

  it('festival days are in correct order', () => {
    const [friday, saturday, sunday] = festivalDays;
    expect(friday.getDay()).toBe(5);
    expect(saturday.getDay()).toBe(6);
    expect(sunday.getDay()).toBe(0);
  });

  it('exports localized date range strings', () => {
    expect(festivalDateRange).toHaveProperty('en');
    expect(festivalDateRange).toHaveProperty('nl');
    expect(festivalDateRange).toHaveProperty('fr');
    expect(festivalDateRange.en).toContain('2025');
    expect(festivalDateRange.nl).toContain('2025');
  });

  it('active edition is either march or october', () => {
    expect(['march', 'october']).toContain(activeEdition);
  });

  it('festival falls in October for october edition', () => {
    if (activeEdition === 'october') {
      expect(festivalDate.getMonth()).toBe(9); // 0-indexed, October = 9
    }
  });
});
