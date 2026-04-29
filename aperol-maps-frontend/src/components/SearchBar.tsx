/**
 * Collaborative Search Bar
 * 
 * Handles local search input and manages shared search terms for collaborative 
 * sessions using WebSockets.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/lib/store";
import type { SearchTerm, Participant } from "@/lib/store";
import { X } from "lucide-react";

interface SearchBarProps {
    /** The current text value of the search input field */
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    /** Submission handler that adds the current query as a tag */
    handleSearchFormSubmit: (e: React.FormEvent) => void;
    /** The color assigned to the current user in a shared session */
    ownColor: string | null;
    /** Active WebSocket connection if in a shared session */
    socket: WebSocket | null;
    /** List of search tags contributed by all session participants */
    sessionSearchTerms: SearchTerm[];
    /** List of search tags if searching locally (not in a session) */
    localSearchTerms: string[];
    handleRemoveQueryTerm: (term: string) => void;
    /** All active search terms across session or local state */
    queryTerms: string[];
    handleClearSearch: () => void;
}

/**
 * SearchBar component provides a tagged-input interface for drink discovery.
 * Visually distinguishes search terms contributed by different participants in collaborative mode.
 */
export const SearchBar = ({
    searchQuery,
    setSearchQuery,
    handleSearchFormSubmit,
    ownColor,
    socket,
    sessionSearchTerms,
    localSearchTerms,
    handleRemoveQueryTerm,
    queryTerms,
    handleClearSearch
}: SearchBarProps) => {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[30] w-full max-w-md">
            <Card style={ownColor ? { borderColor: ownColor, borderWidth: '2px' } : {}}>
                <CardHeader>
                    <CardTitle>Search for Drinks or Venues</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSearchFormSubmit} className="flex w-full items-center space-x-2">
                        <Input
                            type="search"
                            placeholder="Aperol Spritz, Guinness..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Button type="submit">Add</Button>
                    </form>
                    
                    {/* Render active search terms as removable tags */}
                    <div className="flex flex-wrap gap-2 mt-2">
                        {socket ? (
                            // Render session-based terms with contributor colors
                            sessionSearchTerms.map((st: SearchTerm) => {
                                const participant = useSessionStore.getState().participants.find((p: Participant) => p.email === st.participant_email);
                                const color = participant ? participant.color : '#9CA3AF';
                                return (
                                    <div 
                                        key={st.term} 
                                        className={`flex items-center border-2 rounded-full px-3 py-1 text-sm gap-2`} 
                                        style={{ borderColor: color, backgroundColor: `${color}20` }}
                                    >
                                        {st.term}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="h-5 w-5 rounded-full p-0"
                                            onClick={() => handleRemoveQueryTerm(st.term)}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                );
                            })
                        ) : (
                            // Render local terms with default secondary styling
                            localSearchTerms.map(term => (
                                <div 
                                    key={term} 
                                    className="flex items-center bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm gap-2 border"
                                >
                                    <span>{term}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-5 w-5 rounded-full p-0"
                                        onClick={() => handleRemoveQueryTerm(term)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                    {queryTerms.length > 0 && (
                        <Button 
                            variant="link" 
                            size="sm" 
                            className="p-0 h-auto mt-2" 
                            onClick={handleClearSearch}
                        >
                            Clear all
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
