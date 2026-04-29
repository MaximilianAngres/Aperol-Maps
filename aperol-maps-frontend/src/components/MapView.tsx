/**
 * Interactive Map Interface
 * 
 * Displays restaurant locations using Leaflet. Handles marker placement, 
 * map theme switching, and syncing the map view with search results.
 */
import { MapContainer, TileLayer, Marker, ZoomControl } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { VenueMarker } from './VenueMarker';
import type { MatchResult } from '@/lib/types';

interface MapViewProps {
    /** List of restaurants currently filtered for display on the map */
    restaurantsToDisplay: MatchResult[];
    /** The restaurant currently focused/selected in the UI */
    selectedRestaurant: MatchResult | null;
    /** Callback triggered when a restaurant marker is clicked */
    handleRestaurantSelect: (restaurant: MatchResult) => void;
    /** The user's current geographic coordinates [lat, lon] */
    userLocation: [number, number];
    /** Current UI theme (affects map tiles) */
    theme?: 'light' | 'dark';
}

/**
 * The core map component of Aperol Maps.
 * Integrates Leaflet with React to provide a performant, interactive exploration experience.
 */
export const MapView = ({ 
    restaurantsToDisplay, 
    selectedRestaurant, 
    handleRestaurantSelect, 
    userLocation, 
    theme 
}: MapViewProps) => {

    // Dynamic tile selection based on the current theme to maintain visual consistency
    const tileUrl = theme === 'dark'
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    return (
        <MapContainer 
            center={[53.349805, -6.26031]} 
            zoom={15} 
            style={{ height: '100%', width: '100%', zIndex: 10 }} 
            zoomControl={false}
        >
            <TileLayer
                key={theme}
                url={tileUrl}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            {userLocation && (
                <Marker
                    position={userLocation}
                    icon={divIcon({
                        html: `<div class="user-marker-pin"></div>`,
                        className: 'custom-div-icon',
                        iconSize: [30, 40],
                        iconAnchor: [12, 40],
                    })}
                />
            )}
            {restaurantsToDisplay.map(restaurant => (
                <VenueMarker
                    key={restaurant._id}
                    restaurant={restaurant}
                    handleRestaurantSelect={handleRestaurantSelect}
                    isSelected={selectedRestaurant?._id === restaurant._id}
                    theme={theme}
                />
            ))}
            <ZoomControl position="bottomright" />
        </MapContainer>
    );
};
