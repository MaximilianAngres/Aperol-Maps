import { useState, useEffect } from 'react';
import { getRestaurants } from "@/lib/api";
import type { Restaurant } from "@/lib/types";

export const useRestaurants = () => {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

    useEffect(() => {
        const fetchRestaurants = async () => {
            try {
                const data = await getRestaurants();
                setRestaurants(data);
            } catch (error) {
                console.error("Error fetching restaurants", error);
                setRestaurants([]);
            }
        };

        fetchRestaurants();
    }, []);

    return { restaurants };
};