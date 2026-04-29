/**
 * Represents an item on a restaurant's menu.
 */
export interface MenuItem {
  name: string;
  price: number;
  description: string;
}

/**
 * Represents a restaurant or venue in the Aperol Maps ecosystem.
 */
export interface Restaurant {
  _id: string;
  name: string;
  address?: string;
  website?: string;
  /** [Longitude, Latitude] format as used by Leaflet and MongoDB */
  coordinates: [number, number];
  menu: MenuItem[];
  social_media_links?: { [key: string]: string | null };
  opening_hours?: { [key: string]: string | null };
  createdAt?: string;
  lastEditedAt?: string;
}

/**
 * Extended Restaurant interface used for search results,
 * indicating how well the venue matches the user's search query.
 */
export interface MatchResult extends Restaurant {
  /** 'full' if all search terms matched, 'partial' otherwise */
  matchType: 'full' | 'partial';
  /** List of search terms that were not found in this restaurant's menu */
  missingItems: string[];
}

/**
 * A user-created collection of venues.
 */
export interface UserList {
  _id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  venues: {
    venue_id: string;
    added_at: string;
    notes?: string;
  }[];
}

/**
 * Basic user profile information.
 */
export interface User {
  id: string;
  email: string;
}

/**
 * Authentication credentials for login/registration.
 */
export interface AuthCredentials {
  email: string;
  password: string;
}

/**
 * Response received after successful authentication.
 */
export interface AuthResponse {
  /** JWT token used for authorized requests */
  token: string;
}

/**
 * User recommendation/review for a specific venue.
 */
export interface Recommendation {
  _id: string;
  venue_id: string;
  user_id: string;
  rating: 'up' | 'down' | 'neutral';
  comment?: string;
  created_at: string;
}
