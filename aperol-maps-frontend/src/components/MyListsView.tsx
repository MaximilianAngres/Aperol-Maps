/**
 * User Lists Manager
 * 
 * Displays and manages the user's personal restaurant collections. 
 * Allows for list deletion and viewing venues within each list.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Restaurant, UserList } from "@/lib/types";
import { Trash2 } from "lucide-react";

interface MyListsViewProps {
  /** The collection of lists owned by the user */
  userLists: UserList[];
  /** Master list of all restaurants for lookups */
  allVenues: Restaurant[];
  /** Callback to return to the map view */
  onBack: () => void;
  /** Callback to focus a specific venue on the map */
  onVenueSelect: (venue: Restaurant) => void;
  /** Callback to delete an entire list */
  onDeleteList: (listId: string) => void;
  /** Callback to remove a single venue from a specific list */
  onRemoveVenue: (listId: string, venueId: string) => void;
}

/**
 * MyListsView is a full-screen overlay that allows users to manage their 
 * saved venue collections. It uses an accordion-based interface for clear 
 * categorization and organization of saved locations.
 */
export const MyListsView = ({ 
    userLists, 
    allVenues, 
    onBack, 
    onVenueSelect, 
    onDeleteList, 
    onRemoveVenue 
}: MyListsViewProps) => {
  const getVenueById = (venueId: string) => {
    return allVenues.find(v => v._id === venueId);
  };

  return (
    <div className="absolute inset-0 bg-background z-[2000] p-4 sm:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Lists</h1>
          <Button variant="outline" onClick={onBack}>&larr; Back to Map</Button>
        </div>

        {userLists.length === 0 ? (
          <p>You haven't created any lists yet.</p>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {userLists.map(list => (
              <AccordionItem value={list._id} key={list._id}>
                <AccordionTrigger>
                  <div className="flex justify-between w-full items-center">
                    <div className="flex flex-col items-start">
                        <span className="text-lg">{list.name}</span>
                        <span className="text-sm text-muted-foreground">{list.venues.length} venue(s)</span>
                    </div>
                    {/* List-level delete button */}
                    <Button variant="ghost" size="icon" onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Are you sure you want to delete this list?")) {
                            onDeleteList(list._id);
                        }
                    }}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                    {list.description && <p className="mb-4 text-muted-foreground">{list.description}</p>}
                    <div className="space-y-2">
                        {list.venues.map(item => {
                            const venue = getVenueById(item.venue_id);
                            if (!venue) return null;
                            return (
                                <Card key={item.venue_id} className="hover:bg-muted/50 transition-colors">
                                    <CardContent className="p-4 flex justify-between items-center">
                                        <div>
                                            <h3 className="font-semibold">{venue.name}</h3>
                                            {item.notes && <p className="text-sm text-muted-foreground mt-1">Notes: {item.notes}</p>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="secondary" size="sm" onClick={() => onVenueSelect(venue)}>
                                                View on Map
                                            </Button>
                                            {/* Venue-level remove button */}
                                            <Button variant="ghost" size="icon" onClick={() => {
                                                if (window.confirm("Are you sure you want to remove this venue from the list?")) {
                                                    onRemoveVenue(list._id, item.venue_id);
                                                }
                                            }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                        {list.venues.length === 0 && <p>No venues in this list yet.</p>}
                    </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
};
