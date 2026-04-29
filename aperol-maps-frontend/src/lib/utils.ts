import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility for merging Tailwind CSS classes with support for conditional logic.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculates the great-circle distance between two points on a sphere 
 * using the Haversine formula.
 * @returns Distance in kilometers.
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c; // Earth's radius in KM
};

/**
 * Determines the current opening status of a venue based on its operating hours.
 * Supports overnight hours (e.g., 18:00 - 02:00).
 */
export const getOpeningStatus = (openingHours?: { [key: string]: string | null }): { status: string; color: string } => {
  if (!openingHours) {
    return { status: 'Hours unavailable', color: 'text-gray-500' };
  }

  const now = new Date();
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const hoursToday = openingHours[dayOfWeek];

  if (!hoursToday) {
    return { status: 'Closed today', color: 'text-red-500' };
  }

  try {
    const [openStr, closeStr] = hoursToday.split('-');
    const [openHour, openMinute] = openStr.split(':').map(Number);
    const [closeHour, closeMinute] = closeStr.split(':').map(Number);

    const openTime = new Date(now);
    openTime.setHours(openHour, openMinute, 0, 0);

    const closeTime = new Date(now);
    closeTime.setHours(closeHour, closeMinute, 0, 0);

    // Handle businesses that stay open past midnight
    if (closeTime < openTime) {
      closeTime.setDate(closeTime.getDate() + 1);
      if (now < openTime) {
        openTime.setDate(openTime.getDate() - 1)
      }
    }

    const minutesUntilClose = (closeTime.getTime() - now.getTime()) / (1000 * 60);
    const minutesFromOpen = (now.getTime() - openTime.getTime()) / (1000 * 60);

    if (minutesFromOpen >= 0 && minutesUntilClose > 60) {
      return { status: 'Open now', color: 'text-green-500' };
    }
    if (minutesUntilClose > 0 && minutesUntilClose <= 60) {
      return { status: `Closing soon (${Math.round(minutesUntilClose)}m)`, color: 'text-orange-500' };
    }
    if (minutesFromOpen < 0 && minutesFromOpen >= -60) {
      return { status: `Opening soon (${Math.round(Math.abs(minutesFromOpen))}m)`, color: 'text-blue-500' };
    }

    return { status: 'Closed', color: 'text-red-500' };

  } catch (error) {
    console.error("Error parsing opening hours:", error);
    return { status: 'Hours format error', color: 'text-yellow-500' };
  }
};
