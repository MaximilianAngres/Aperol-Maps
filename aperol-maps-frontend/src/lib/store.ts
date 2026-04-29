/**
 * Global State Management
 * 
 * Powered by Zustand. Manages user authentication state and real-time 
 * collaborative session data (WebSockets, shared search terms, etc.).
 */
import { create } from 'zustand';
import type { User } from '@/lib/types';

/**
 * Represents a user participating in a shared session.
 */
export interface Participant {
  email: string;
  color: string;
}

/**
 * A search term contributed by a participant in a shared session.
 */
export interface SearchTerm {
  term: string;
  participant_email: string;
}

/**
 * State and actions for managing real-time collaborative sessions.
 * Uses WebSockets for synchronization across participants.
 */
interface SessionState {
  sessionId: string | null;
  participants: Participant[];
  searchTerms: SearchTerm[];
  socket: WebSocket | null;
  reconnectAttempts: number;
  /** Initiates a WebSocket connection to a shared session */
  connectToSession: (sessionId: string) => void;
  setSession: (sessionId: string, socket: WebSocket) => void;
  addParticipant: (participant: Participant) => void;
  addSearchTerm: (searchTerm: SearchTerm) => void;
  removeSearchTerm: (term: string) => void;
  /** Sets the base state when first joining a session */
  setInitialState: (participants: Participant[], searchTerms: SearchTerm[]) => void;
  /** Closes the connection and clears session data */
  leaveSession: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Store for managing collaborative session state.
 */
export const useSessionStore = create<SessionState>((set, get) => {
  const disconnect = () => {
    set({ sessionId: null, participants: [], searchTerms: [], socket: null, reconnectAttempts: 0 });
  };
  
  return {
    sessionId: null,
    participants: [],
    searchTerms: [],
    socket: null,
    reconnectAttempts: 0,
    
    connectToSession: (sessionId: string) => {
      const currentSocket = get().socket;
      // Prevent multiple connections for the same session
      if (currentSocket && currentSocket.readyState < 2) return;

      const token = localStorage.getItem('token');
      if (!token) {
        console.error("Authentication token not found.");
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const socketUrl = `${protocol}//${host}/ws/sessions/${sessionId}?token=${token}`;
      const socket = new WebSocket(socketUrl);
      
      socket.onopen = () => {
        set({ reconnectAttempts: 0 }); 
        get().setSession(sessionId, socket);
        localStorage.setItem('activeSessionId', sessionId);
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        // Handle various event types from the server
        switch (message.type) {
            case 'session_state':
                get().setInitialState(message.participants, message.search_terms);
                break;
            case 'user_joined':
                get().addParticipant(message.participant);
                break;
            case 'term_added':
                get().addSearchTerm(message.search_term);
                break;
            case 'term_removed':
                get().removeSearchTerm(message.term);
                break;
            default:
                console.warn('Received unknown message type:', message.type);
        }
      };
      
      socket.onclose = (event) => {
        set({ socket: null }); 

        const wasIntentional = event.code === 1000;

        // Exponential backoff for reconnections
        if (!wasIntentional && get().reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const attempts = get().reconnectAttempts;
          const delay = Math.pow(2, attempts) * 1000; 
                    
          setTimeout(() => {
            set({ reconnectAttempts: get().reconnectAttempts + 1 });
            get().connectToSession(sessionId);
          }, delay);
        } else if (get().reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          localStorage.removeItem('activeSessionId');
          disconnect();
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    },
    setSession: (sessionId, socket) => set({ sessionId, socket }),
    addParticipant: (participant) => set((state) => ({ participants: [...state.participants, participant] })),
    addSearchTerm: (searchTerm) => set((state) => ({ searchTerms: [...state.searchTerms, searchTerm] })),
    removeSearchTerm: (term) => set((state) => ({
      searchTerms: state.searchTerms.filter((st) => st.term !== term),
    })),
    setInitialState: (participants, searchTerms) => set({ participants, searchTerms }),
    
    leaveSession: () => {
      const { socket } = get();
      if (socket) {
        socket.onclose = null; 
        socket.close(1000, "User left session");
      }
      localStorage.removeItem('activeSessionId');
      disconnect();
    }
  };
});

/**
 * State for tracking the currently authenticated user.
 */
interface AuthState {
    isAuthenticated: boolean;
    currentUser: User | null;
    setIsAuthenticated: (isAuthenticated: boolean) => void;
    setCurrentUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    currentUser: null,
    setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
    setCurrentUser: (user) => set({ currentUser: user }),
}));
