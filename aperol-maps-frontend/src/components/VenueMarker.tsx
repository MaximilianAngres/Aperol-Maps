/**
 * Map Marker Component
 * 
 * Renders custom markers for the map view. Highlights venues based on 
 * search relevance and handles user selection via clicks.
 */
import { useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import ReactDOMServer from 'react-dom/server';
import type { MatchResult } from "@/lib/types";

/**
 * Custom Map Marker component for venues.
 * Dynamically adjusts its appearance based on:
 * - Match quality (full vs partial search match)
 * - Selection state
 * - Hover state and map zoom level (auto-showing venue names)
 */
export const VenueMarker = ({ 
    restaurant, 
    handleRestaurantSelect, 
    isSelected, 
    theme 
}: { 
    restaurant: MatchResult, 
    handleRestaurantSelect: (restaurant: MatchResult) => void, 
    isSelected: boolean, 
    theme?: 'light' | 'dark' 
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const map = useMap();
    const zoomLevel = map.getZoom();

    // Venue names are visible if hovered or if the user zooms in significantly
    const isTextVisible = isHovered || zoomLevel > 17;
    const isPartialMatch = restaurant.matchType === 'partial';

    const textColor = theme === 'dark' ? 'white' : 'black';

    // Leaflet requires raw HTML for custom icons; we use ReactDOMServer to bridge React and Leaflet
    const icon = divIcon({
        html: ReactDOMServer.renderToString(
            <div className="custom-marker-container">
                <div
                    className={`marker-pin ${isPartialMatch ? 'marker-pin-partial' : ''} ${isSelected ? 'marker-pin-selected-highlight' : ''}`}
                ></div>
                <div
                    className={`marker-text ${isTextVisible ? 'marker-text-visible' : ''}`}
                    style={{ color: textColor }}
                >
                    {restaurant.name}
                </div>
            </div>
        ),
        className: 'custom-div-icon',
        iconSize: [30, 40],
        iconAnchor: [12, 40],
    });

    return (
        <Marker
            key={restaurant._id}
            position={[restaurant.coordinates[1], restaurant.coordinates[0]]}
            icon={icon}
            eventHandlers={{
                click: () => handleRestaurantSelect(restaurant),
                mouseover: () => setIsHovered(true),
                mouseout: () => setIsHovered(false),
            }}
        />
    );
};
