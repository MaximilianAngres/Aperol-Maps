/**
 * Collaborative Session Entry Point
 * 
 * Handles joining a shared group session via URL parameters. Redirects users 
 * and initializes WebSocket connections for real-time collaboration.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { Auth } from './Auth';

export const SessionJoiner = () => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const { connectToSession } = useSessionStore();
    const { isAuthenticated, handleLogin } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    useEffect(() => {
        if (sessionId && !isAuthenticated) {
            setIsAuthModalOpen(true);
        }
    }, [sessionId, isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated && sessionId) {
            connectToSession(sessionId);
            navigate('/');
        }
    }, [isAuthenticated, sessionId, connectToSession, navigate]);

    const onAuthSuccess = async (token: string) => {
        await handleLogin(token);
        setIsAuthModalOpen(false);
    };

    if (!isAuthenticated && sessionId) {
        return <Auth onAuthSuccess={onAuthSuccess} open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />;
    }

    return null;
};