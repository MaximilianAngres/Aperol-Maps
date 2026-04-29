/**
 * Search Logic Hook
 * 
 * Orchestrates venue filtering based on both local search input and 
 * shared terms from collaborative sessions. Includes fuzzy matching 
 * and distance-based sorting.
 */
import { useState, useMemo, useEffect } from 'react';
import { useSessionStore } from '@/lib/store';
import type { MatchResult, Restaurant } from "@/lib/types";
import { calculateDistance } from '@/lib/utils';

/**
 * Custom hook for managing restaurant search and filtering logic.
 * Supports both local search and collaborative session-based search.
 */
export const useSearch = (restaurants: Restaurant[], userLocation: [number, number]) => {
    const [searchResults, setSearchResults] = useState<MatchResult[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const { searchTerms: sessionSearchTerms, socket } = useSessionStore();
    const [localSearchTerms, setLocalSearchTerms] = useState<string[]>([]);
    
    // Determine query terms based on whether the user is in a collaborative session
    const queryTerms = useMemo(() => 
        socket ? sessionSearchTerms.map(st => st.term) : localSearchTerms, 
        [socket, sessionSearchTerms, localSearchTerms]
    );

    const [hasSearched, setHasSearched] = useState(false);
    const [sortType, setSortType] = useState<'default' | 'price' | 'distance'>('default');

    /**
     * Resets search state and clears both local and session-based terms.
     */
    const handleClearSearch = () => {
        if (socket) {
            queryTerms.forEach(term => handleRemoveQueryTerm(term));
        }
        setLocalSearchTerms([]);
        setSearchQuery('');
        setSearchResults([]);
        setHasSearched(false);
    };

    /**
     * Adds a new search term. If in a session, sends the term to the WebSocket.
     */
    const handleAddQueryTerm = () => {
        const term = searchQuery.trim().toLowerCase();
        if (!term) return;
        if (socket) {
            socket.send(JSON.stringify({ action: 'add', term }));
        } else {
            if (!localSearchTerms.includes(term)) {
                setLocalSearchTerms([...localSearchTerms, term]);
            }
        }
        setSearchQuery('');
    };

    /**
     * Removes a search term. If in a session, sends the removal request to the WebSocket.
     */
    const handleRemoveQueryTerm = (term: string) => {
        if (socket) {
            socket.send(JSON.stringify({ action: 'remove', term }));
        } else {
            setLocalSearchTerms(localSearchTerms.filter(t => t !== term));
        }
    };

    /**
     * Core search logic: matches query terms against restaurant names and menu items.
     */
    const performSearch = (currentQueryTerms: string[]) => {
        if (currentQueryTerms.length === 0) {
            setSearchResults([]);
            setHasSearched(false);
            return;
        }
        setHasSearched(true);

        const results: MatchResult[] = restaurants.map(restaurant => {
            const lowerCaseMenu = restaurant.menu.map(item => item.name.toLowerCase());
            
            // Find which terms match this restaurant
            const foundItems = currentQueryTerms.filter(term =>
                lowerCaseMenu.some(menuItem => menuItem.includes(term)) || 
                restaurant.name.toLowerCase().includes(term)
            );

            if (foundItems.length === 0) return null;

            // Identify missing items for 'partial match' feedback
            const missingItems = currentQueryTerms.filter(term => !foundItems.includes(term));

            return {
                ...restaurant,
                matchType: missingItems.length === 0 ? 'full' : 'partial',
                missingItems: missingItems,
            };
        }).filter((r): r is MatchResult => r !== null);

        setSearchResults(results);
        setSortType('default');
    };

    // Re-run search whenever query terms or restaurant data changes
    useEffect(() => {
        performSearch(queryTerms);
    }, [queryTerms, restaurants]);

    /**
     * Memoized sorting of results based on price, distance, or match quality.
     */
    const sortedSearchResults = useMemo(() => {
        let sorted = [...searchResults];
        
        if (sortType === 'price') {
            sorted.sort((a, b) => {
                const getAveragePrice = (restaurant: MatchResult) => {
                    const matchingItems = restaurant.menu.filter(item => 
                        queryTerms.some(q => item.name.toLowerCase().includes(q))
                    );
                    if (matchingItems.length === 0) return Infinity;
                    const total = matchingItems.reduce((acc, item) => acc + item.price, 0);
                    return total / matchingItems.length;
                };
                return getAveragePrice(a) - getAveragePrice(b);
            });
        } else if (sortType === 'distance') {
            sorted.sort((a, b) => {
                const distA = calculateDistance(userLocation[0], userLocation[1], a.coordinates[1], a.coordinates[0]);
                const distB = calculateDistance(userLocation[0], userLocation[1], b.coordinates[1], b.coordinates[0]);
                return distA - distB;
            });
        }

        // Secondary sort: prioritize 'full' matches over 'partial'
        sorted.sort((a, b) => {
            if (a.matchType === 'full' && b.matchType === 'partial') return -1;
            if (a.matchType === 'partial' && b.matchType === 'full') return 1;
            return 0;
        });

        return sorted;
    }, [searchResults, sortType, queryTerms, userLocation]);

    return {
        searchResults,
        searchQuery,
        setSearchQuery,
        queryTerms,
        hasSearched,
        setHasSearched,
        sortType,
        setSortType,
        handleClearSearch,
        handleAddQueryTerm,
        handleRemoveQueryTerm,
        sortedSearchResults,
        localSearchTerms,
        sessionSearchTerms
    };
};
