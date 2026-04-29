/**
 * Sidebar View Controller
 * 
 * Manages the main sidebar content, including search results, venue details, 
 * and user recommendations. It acts as the primary container for list-based data.
 */
import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOpeningStatus } from "@/lib/utils";
import type { MatchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Globe, Navigation, Bookmark, Upload, MessageSquare } from 'lucide-react';
import { RecommendationView } from './RecommendationView';

interface SheetViewProps {
    /** The current active sub-view within the sidebar */
    sheetView: 'list' | 'details' | 'recommendations';
    setSheetView: (view: 'list' | 'details' | 'recommendations') => void;
    /** The restaurant record currently being viewed in detail */
    selectedRestaurant: MatchResult | null;
    setSelectedRestaurant: (restaurant: MatchResult | null) => void;
    /** The raw set of restaurants matching the current search query */
    searchResults: MatchResult[];
    /** The search results after applying the user's selected sort criteria */
    sortedSearchResults: MatchResult[];
    /** Callback to select a restaurant from the list */
    handleRestaurantSelect: (restaurant: MatchResult) => void;
    setSortType: (type: 'default' | 'price' | 'distance') => void;
    isAuthenticated: boolean;
    setIsSaveToListDialogOpen: (isOpen: boolean) => void;
    /** Flag indicating if the user has performed at least one search */
    hasSearched: boolean;
    /** Active search terms used for matching and highlighting */
    queryTerms: string[];
}

/**
 * SheetView is the primary information display component in Aperol Maps.
 * It manages the transition between search results, detailed venue information,
 * and user-contributed recommendations in a responsive sidebar.
 */
export const SheetView = ({
    sheetView,
    setSheetView,
    selectedRestaurant,
    setSelectedRestaurant,
    searchResults,
    sortedSearchResults,
    handleRestaurantSelect,
    setSortType,
    isAuthenticated,
    setIsSaveToListDialogOpen,
    hasSearched,
    queryTerms
}: SheetViewProps) => {
    const [isOpeningHoursExpanded, setIsOpeningHoursExpanded] = useState(false);
    const [menuSearchTerm, setMenuSearchTerm] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Handles the upload of a new menu image.
     * The image is sent to the API, which queues it for LLM-based extraction.
     */
    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        const token = localStorage.getItem('token'); 
        if (!token) {
            window.alert("You must be logged in to upload a menu.");
            return;
        }

        if (!file || !selectedRestaurant) {
            window.alert("No file or restaurant selected.");
            return;
        }

        setIsUploading(true);
        console.log("Uploading new menu...");

        try {
            const formData = new FormData();
            formData.append('menuImage', file);

            const apiUrl = `/api/restaurants/${selectedRestaurant._id}/upload-menu`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to upload menu.' }));
                throw new Error(errorData.message);
            }

            window.alert("Menu submitted for processing! Thank you for contributing.");

        } catch (error) {
            console.error('Upload failed:', error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            window.alert(`Upload failed: ${errorMessage}`);
        } finally {
            setIsUploading(false);
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    // --- Sub-view: Recommendations ---
    if (sheetView === 'recommendations' && selectedRestaurant) {
        return (
            <div className="flex flex-col h-full">
                 <div className="flex flex-col space-y-2 text-center sm:text-left mb-2">
                    <h2 className="text-lg font-semibold text-foreground">{selectedRestaurant.name}</h2>
                </div>
                <Button variant="outline" size="sm" className="mb-2 w-full" onClick={() => setSheetView('details')}>
                    &larr; Back to Details
                </Button>
                <ScrollArea className="flex-grow">
                    <RecommendationView venueId={selectedRestaurant._id} isAuthenticated={isAuthenticated} />
                </ScrollArea>
            </div>
        );
    }

    // --- Sub-view: Venue Details ---
    if (sheetView === 'details' && selectedRestaurant) {
        const socialLinks = selectedRestaurant.social_media_links
            ? Object.entries(selectedRestaurant.social_media_links).filter(([, url]) => url)
            : [];
        const openingStatus = getOpeningStatus(selectedRestaurant.opening_hours);
        const filteredMenu = selectedRestaurant.menu.filter(item =>
            item.name.toLowerCase().includes(menuSearchTerm.toLowerCase())
        );

        return (
            <div className="flex flex-col h-full">
                <div className="flex flex-col space-y-2 text-center sm:text-left">
                    <h2 className="text-lg font-semibold text-foreground">{selectedRestaurant.name}</h2>
                    {selectedRestaurant.matchType === 'partial' && selectedRestaurant.missingItems.length > 0 && (
                        <div className="text-sm text-amber-600">
                            Missing: {selectedRestaurant.missingItems.join(', ')}
                        </div>
                    )}
                    <div
                        className="flex items-center cursor-pointer"
                        onClick={() => setIsOpeningHoursExpanded(!isOpeningHoursExpanded)}
                    >
                        <div className={`text-sm font-semibold ${openingStatus.color}`}>
                            {openingStatus.status}
                        </div>
                        <svg className={`w-4 h-4 ml-1 transition-transform ${isOpeningHoursExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </div>
                </div>

                {isOpeningHoursExpanded && selectedRestaurant.opening_hours && (
                    <div className="mt-2 text-sm text-muted-foreground">
                        <ul>
                            {Object.entries(selectedRestaurant.opening_hours).map(([day, hours]) => (
                                <li key={day} className="flex justify-between">
                                    <span className="capitalize">{day}</span>
                                    <span>{hours || 'Closed'}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="py-4">
                    <div className="flex items-center">
                        <div className="flex-grow border-t border-border"></div>
                        <span className="px-2 text-xs text-muted-foreground">Actions</span>
                        <div className="flex-grow border-t border-border"></div>
                    </div>
                    <div className="flex justify-around py-2">
                        <Button variant="outline" size="icon" asChild title="Navigate on Google Maps">
                            <a href={`https://www.google.com/maps/search/?api=1&query=${selectedRestaurant.coordinates[1]},${selectedRestaurant.coordinates[0]}`} target="_blank" rel="noopener noreferrer">
                                <Navigation className="h-4 w-4" />
                            </a>
                        </Button>
                        {isAuthenticated && (
                            <>
                                <Button variant="outline" size="icon" onClick={() => setIsSaveToListDialogOpen(true)} title="Save to list">
                                    <Bookmark className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => setSheetView('recommendations')} title="View recommendations">
                                    <MessageSquare className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={triggerFileUpload} title="Upload new menu" disabled={isUploading}>
                                    <Upload className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </div>
                    {isAuthenticated && (
                        <Input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/png, image/jpeg, image/webp" />
                    )}
                    <div className="flex items-center">
                        <div className="flex-grow border-t border-border"></div>
                        <span className="px-2 text-xs text-muted-foreground">External Links</span>
                        <div className="flex-grow border-t border-border"></div>
                    </div>
                    <div className="flex flex-wrap gap-2 py-2">
                        {selectedRestaurant.website && (
                            <Button variant="outline" size="sm" asChild>
                                <a href={selectedRestaurant.website} target="_blank" rel="noopener noreferrer"><Globe className="mr-2 h-4 w-4" />Website</a>
                            </Button>
                        )}
                        {socialLinks.map(([platform, url]) => (
                            <Button key={platform} variant="outline" size="sm" asChild>
                                <a href={url!} target="_blank" rel="noopener noreferrer" className="capitalize">{platform}</a>
                            </Button>
                        ))}
                    </div>
                </div>

                {hasSearched && (
                    <Button variant="outline" size="sm" className="my-2" onClick={() => { setSheetView('list'); setSelectedRestaurant(null); setIsOpeningHoursExpanded(false); }}>
                        &larr; Back to Results
                    </Button>
                )}
                <div className="my-4">
                    <Input placeholder="Search the menu..." value={menuSearchTerm} onChange={(e) => setMenuSearchTerm(e.target.value)} />
                </div>
                <ScrollArea className="flex-grow">
                    <ul className="py-4 pr-4 space-y-2">
                        {filteredMenu.length > 0 ? (
                            filteredMenu.map(item => (
                                <li key={`${item.name}-${item.price}`} className="border rounded-lg p-3 pr-6">
                                    <div className="flex justify-between">
                                        <strong className="font-semibold">{item.name}</strong>
                                        <span className="font-bold text-lg">€{item.price.toFixed(2)}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{item.description}</p>
                                </li>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground">No menu items found.</p>
                        )}
                    </ul>
                </ScrollArea>
            </div>
        );
    }

    // --- Sub-view: Search Results List ---
    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-col space-y-2 text-center sm:text-left">
                <h2 className="text-lg font-semibold text-foreground">Search Results ({searchResults.length})</h2>
            </div>
            <div className="py-2">
                <Select onValueChange={(value) => setSortType(value as any)} defaultValue="default">
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sort by..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="price">Price</SelectItem>
                        <SelectItem value="distance">Distance</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <ScrollArea className="flex-grow">
                <ul className="py-4 pr-4 space-y-2">
                    {sortedSearchResults.map(result => {
                        const matchingItems = result.menu.filter(item => queryTerms.some(q => item.name.toLowerCase().includes(q)));
                        const averagePrice = matchingItems.length > 0 
                            ? matchingItems.reduce((acc, item) => acc + item.price, 0) / matchingItems.length
                            : null;
                        const displayPrice = averagePrice !== null ? `€${averagePrice.toFixed(2)}` : null;
                        const itemNameToDisplay = matchingItems.length > 0 ? matchingItems.map(item => item.name).join(', ') : 'Venue match';

                        return (
                            <li
                                key={result._id}
                                className={cn(
                                    "border rounded-lg p-3 pr-6 hover:bg-muted/50 transition-colors cursor-pointer",
                                    { "border-border/50 opacity-70": result.matchType === 'partial' }
                                )}
                                onClick={() => handleRestaurantSelect(result)}
                            >
                                <div className="flex justify-between items-center">
                                    <strong className="font-semibold">{result.name}</strong>
                                    {displayPrice && (
                                        <span className="font-bold text-lg">
                                            {displayPrice}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {result.matchType === 'partial' && result.missingItems.length > 0
                                        ? `Missing: ${result.missingItems.join(', ')}`
                                        : itemNameToDisplay}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            </ScrollArea>
        </div>
    );
};
