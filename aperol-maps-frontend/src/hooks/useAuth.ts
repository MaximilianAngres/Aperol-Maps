/**
 * Authentication Hook
 * 
 * Simplifies auth state management across components. Handles initial 
 * token verification and provides centralized login/logout logic.
 */
import { useEffect, useCallback } from 'react';
import { fetchCurrentUser } from "@/lib/api";
import { useAuthStore } from '@/lib/store';

export const useAuth = () => {
    const {
        isAuthenticated,
        currentUser,
        setIsAuthenticated,
        setCurrentUser
    } = useAuthStore();

    useEffect(() => {
        const initializeAuth = async () => {
            const token = localStorage.getItem("token");
            if (token) {
                const user = await fetchCurrentUser();
                if (user) {
                    setIsAuthenticated(true);
                    setCurrentUser(user);
                } else {
                    localStorage.removeItem("token");
                    setIsAuthenticated(false);
                    setCurrentUser(null);
                }
            }
        };
        initializeAuth();
    }, [setIsAuthenticated, setCurrentUser]);

    const handleLogin = useCallback(async (token: string) => {
        localStorage.setItem("token", token);
        const user = await fetchCurrentUser();
        if (user) {
            setIsAuthenticated(true);
            setCurrentUser(user);
        } else {
            localStorage.removeItem("token");
            setIsAuthenticated(false);
            setCurrentUser(null);
        }
    }, [setIsAuthenticated, setCurrentUser]);

    const handleLogout = useCallback(() => {
        localStorage.removeItem("token");
        setIsAuthenticated(false);
        setCurrentUser(null);
    }, [setIsAuthenticated, setCurrentUser]);

    return {
        isAuthenticated,
        currentUser,
        handleLogin,
        handleLogout,
    };
};