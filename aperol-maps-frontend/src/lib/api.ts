/**
 * API Client Configuration
 * 
 * Centralized Axios instance for communicating with the Rust backend. 
 * Handles JWT injection for authenticated requests and maps API responses.
 */
import axios from 'axios';
import type { User, UserList, AuthCredentials, AuthResponse, Restaurant, Recommendation } from './types';

const apiClient = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    }
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


export const fetchCurrentUser = async (): Promise<User | null> => {
  const token = localStorage.getItem("token");
  if (!token) {
    return null;
  }

  try {
    const response = await apiClient.get('/users/me');
    return response.data;
  } catch (error) {
    console.error("Failed to fetch current user:", error);
    localStorage.removeItem("token");
    return null;
  }
};


export const getUserLists = async (): Promise<UserList[]> => {
  const { data } = await apiClient.get('/lists');
  return data;
};

export const createList = async (name: string, description?: string): Promise<UserList> => {
    const { data } = await apiClient.post('/lists', { name, description });
    return data;
};

export const deleteList = async (listId: string): Promise<void> => {
    await apiClient.delete(`/lists/${listId}`);
};

export const removeVenueFromList = async (listId: string, venueId: string): Promise<void> => {
    await apiClient.delete(`/lists/${listId}/venues/${venueId}`);
};

export const addVenueToList = async (listId: string, venueId: string, notes?: string) => {
    await apiClient.post(`/lists/${listId}/venues`, { venue_id: venueId, notes });
};

export const loginUser = async (credentials: AuthCredentials): Promise<AuthResponse> => {
    const { data } = await apiClient.post('/auth/login', credentials);
    return data;
};

export const registerUser = async (credentials: AuthCredentials): Promise<AuthResponse> => {
    const { data } = await apiClient.post('/auth/register', credentials);
    return data;
};

export const getRestaurants = async (): Promise<Restaurant[]> => {
    const { data } = await apiClient.get('/restaurants');
    return data;
};

export const createSession = async (): Promise<{ session_id: string }> => {
    const { data } = await apiClient.post('/sessions');
    return data;
};

export const fetchRecommendations = async (venueId: string): Promise<Recommendation[]> => {
    const { data } = await apiClient.get(`/restaurants/${venueId}/recommendations`);
    return data;
};

export const submitRecommendation = async (
    venueId: string, 
    recommendation: { rating: 'up' | 'down' | 'neutral'; comment: string }
): Promise<Recommendation> => {
    const { data } = await apiClient.post(`/restaurants/${venueId}/recommendations`, recommendation);
    return data;
};