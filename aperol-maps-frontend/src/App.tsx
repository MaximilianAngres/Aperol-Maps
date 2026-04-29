import { useState, useMemo, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from "lucide-react";
import './App.css';
import 'leaflet/dist/leaflet.css';

import { Button } from "@/components/ui/button";
import { MyListsView } from "@/components/MyListsView";
import { Auth } from "@/components/Auth";
import { cn } from "@/lib/utils";
import type { Restaurant, MatchResult } from "@/lib/types";
import { useSessionStore } from './lib/store';
import { ShareSessionDialog } from './components/ShareSessionDialog';
import { useAuth } from './hooks/useAuth';
import { useRestaurants } from './hooks/useRestaurants';
import { useSearch } from './hooks/useSearch';
import { useUserLists } from './hooks/useUserLists';
import { MapView } from './components/MapView';
import { SearchBar } from './components/SearchBar';
import { SheetView } from './components/SheetView';
import { SaveToListDialog } from './components/SaveToListDialog';
import { SessionJoiner } from './components/SessionJoiner';
import { UserProfileMenu } from "@/components/UserProfileMenu";

function App() {
    const [selectedRestaurant, setSelectedRestaurant] = useState<MatchResult | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetView, setSheetView] = useState<'list' | 'details' | 'recommendations'>('list');
    const [userLocation, setUserLocation] = useState<[number, number]>([53.34357, -6.26039]);

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation([position.coords.latitude, position.coords.longitude]);
                },
                (error) => {
                    console.error("Error getting user location:", error);
                }
            );
        }
    }, []);
    const [currentView, setCurrentView] = useState<'map' | 'lists'>('map');
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'light' || storedTheme === 'dark') {
            return storedTheme;
        }
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const savedSessionId = localStorage.getItem('activeSessionId');
        if (savedSessionId) {
            console.log('Found saved session, attempting to reconnect:', savedSessionId);
            useSessionStore.getState().connectToSession(savedSessionId);
        }
    }, []); 

    const handleToggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    const { isAuthenticated, currentUser, handleLogin, handleLogout } = useAuth();
    const { restaurants } = useRestaurants();
    const {
        searchResults,
        searchQuery,
        setSearchQuery,
        queryTerms,
        hasSearched,
        setSortType,
        handleClearSearch,
        handleAddQueryTerm,
        handleRemoveQueryTerm,
        sortedSearchResults,
        localSearchTerms,
        sessionSearchTerms
    } = useSearch(restaurants, userLocation);

    const {
        userLists,
        isSaveToListDialogOpen,
        setIsSaveToListDialogOpen,
        selectedListId,
        setSelectedListId,
        newListName,
        setNewListName,
        isCreatingList,
        setIsCreatingList,
        handleSaveToList,
        handleDeleteList,
        handleRemoveVenue
    } = useUserLists(isAuthenticated, selectedRestaurant);

    const { socket, participants } = useSessionStore();

    const ownColor = useMemo(() => {
        if (!socket || !currentUser) return null;
        const self = participants.find(p => p.email === currentUser.email);
        return self ? self.color : null;
    }, [socket, currentUser, participants]);

    const restaurantsToDisplay = hasSearched && queryTerms.length > 0 ? searchResults : restaurants.map(r => ({ ...r, matchType: 'full', missingItems: [] } as MatchResult));

    const handleSearchFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleAddQueryTerm();
    };

    const handleRestaurantSelect = (restaurant: MatchResult) => {
        setSelectedRestaurant(restaurant);
        setSheetView('details');
        setIsSheetOpen(true);
    };

    const handleVenueSelectFromList = (venue: Restaurant) => {
        const selectedAsMatchResult: MatchResult = { ...venue, matchType: 'full', missingItems: [] };
        setSelectedRestaurant(selectedAsMatchResult);
        setSheetView('details');
        setIsSheetOpen(true);
        setCurrentView('map');
    };

    const onLoginSuccess = async (token: string) => {
        await handleLogin(token);
        setIsAuthModalOpen(false);
    };

    useEffect(() => {
        if (searchResults.length > 0) {
            setIsSheetOpen(true);
            setSheetView('list');
        }
    }, [searchResults]);

    const userForMenu = currentUser ? {
        name: currentUser.email,
    } : null;

    return (
        <Routes>
            <Route path="/join/:sessionId" element={<SessionJoiner />} />
            <Route path="/" element={
                <div className="relative h-screen overflow-hidden bg-background text-foreground">
                    {/* ... (rest of the JSX is unchanged) ... */}
                     {currentView === 'map' ? (
                        <>
                            <MapView
                                restaurantsToDisplay={restaurantsToDisplay}
                                selectedRestaurant={selectedRestaurant}
                                handleRestaurantSelect={handleRestaurantSelect}
                                userLocation={userLocation}
                                theme={theme}
                            />
                            <SearchBar
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                handleSearchFormSubmit={handleSearchFormSubmit}
                                ownColor={ownColor}
                                socket={socket}
                                sessionSearchTerms={sessionSearchTerms}
                                localSearchTerms={localSearchTerms}
                                handleRemoveQueryTerm={handleRemoveQueryTerm}
                                queryTerms={queryTerms}
                                handleClearSearch={handleClearSearch}
                            />
                            
                            <div className="absolute top-4 right-4 z-[1000]">
                                <UserProfileMenu
                                    isAuthenticated={isAuthenticated}
                                    user={userForMenu}
                                    theme={theme}
                                    onLogin={() => setIsAuthModalOpen(true)}
                                    onLogout={handleLogout}
                                    onMyLists={() => setCurrentView('lists')}
                                    onToggleTheme={handleToggleTheme}
                                    onShareSession={() => setIsShareDialogOpen(true)}
                                />
                            </div>

                            {(hasSearched || isSheetOpen) && (
                                <>
                                    <div className={cn(
                                        "absolute top-0 md:top-1/2 md:-translate-y-1/2 left-0 h-full md:h-[96%] w-full md:w-[28rem] bg-background/90 backdrop-blur-sm p-4 rounded-none md:rounded-r-2xl shadow-lg transition-transform duration-300 ease-in-out z-40",
                                        isSheetOpen ? "translate-x-0" : "-translate-x-full"
                                    )}>
                                        <SheetView
                                            sheetView={sheetView}
                                            setSheetView={setSheetView}
                                            selectedRestaurant={selectedRestaurant}
                                            setSelectedRestaurant={setSelectedRestaurant}
                                            searchResults={searchResults}
                                            sortedSearchResults={sortedSearchResults}
                                            handleRestaurantSelect={handleRestaurantSelect}
                                            setSortType={setSortType}
                                            isAuthenticated={isAuthenticated}
                                            setIsSaveToListDialogOpen={setIsSaveToListDialogOpen}
                                            hasSearched={hasSearched}
                                            queryTerms={queryTerms}
                                        />
                                    </div>

                                    <div className={cn(
                                        "absolute top-16 md:top-1/2 md:-translate-y-1/2 z-50 transition-all duration-500 ease-in-out",
                                        isSheetOpen ? "left-full -translate-x-full md:left-[28rem] md:translate-x-0" : "left-0"
                                    )}>
                                        <Button
                                            variant="secondary"
                                            className="rounded-l-none w-8 h-12 p-1"
                                            onClick={() => setIsSheetOpen(!isSheetOpen)}
                                        >
                                            {isSheetOpen ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <MyListsView
                            userLists={userLists}
                            allVenues={restaurants}
                            onBack={() => setCurrentView('map')}
                            onVenueSelect={handleVenueSelectFromList}
                            onDeleteList={handleDeleteList}
                            onRemoveVenue={handleRemoveVenue}
                        />
                    )}

                    <Auth
                        open={isAuthModalOpen}
                        onOpenChange={setIsAuthModalOpen}
                        onAuthSuccess={onLoginSuccess}
                    />
                    <ShareSessionDialog
                        open={isShareDialogOpen}
                        onOpenChange={setIsShareDialogOpen}
                        currentUser={currentUser}
                    />
                    <SaveToListDialog
                        isSaveToListDialogOpen={isSaveToListDialogOpen}
                        setIsSaveToListDialogOpen={setIsSaveToListDialogOpen}
                        selectedRestaurant={selectedRestaurant}
                        userLists={userLists}
                        selectedListId={selectedListId}
                        setSelectedListId={setSelectedListId}
                        newListName={newListName}
                        setNewListName={setNewListName}
                        isCreatingList={isCreatingList}
                        setIsCreatingList={setIsCreatingList}
                        handleSaveToList={handleSaveToList}
                    />
                </div>
            } />
        </Routes>
    );
}

export default App;