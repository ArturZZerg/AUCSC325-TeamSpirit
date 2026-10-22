import type { Course } from '@/lib/types';

const catalogCode = /^([A-Za-z]{2,8})\s?(\d{3}[A-Za-z]?)\b/;
const maxLabel = 28;

/**
 * Short course label for lists and chips. Canvas codes for cross-listed
 * sections read like "AUCSC 325 LAB D01 - AUCSC 325 LEC A01 - Fall 2026";
 * students recognise the catalog code ("AUCSC 325"), so lead with it.
 * Full names stay on the course detail screen.
 */
export function courseLabel(course: Pick<Course, 'code' | 'name'>): string {
  const raw = (course.code?.trim() || course.name).trim();
  const match = catalogCode.exec(raw);
  if (match) return `${match[1]} ${match[2]}`;
  return raw.length > maxLabel ? `${raw.slice(0, maxLabel - 1).trimEnd()}…` : raw;
}
