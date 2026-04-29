import { useState, useEffect } from 'react';
import { getUserLists, createList, addVenueToList, deleteList, removeVenueFromList } from "@/lib/api";
import type { UserList, MatchResult } from "@/lib/types";

export const useUserLists = (isAuthenticated: boolean, selectedRestaurant: MatchResult | null) => {
    const [userLists, setUserLists] = useState<UserList[]>([]);
    const [isSaveToListDialogOpen, setIsSaveToListDialogOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [newListName, setNewListName] = useState('');
    const [isCreatingList, setIsCreatingList] = useState(false);

    const fetchUserLists = async () => {
        if (!isAuthenticated) return;
        try {
            const lists = await getUserLists();
            setUserLists(lists);
        } catch (error) {
            console.error("Failed to fetch user lists:", error);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchUserLists();
        }
    }, [isAuthenticated]);

    const handleSaveToList = async () => {
        if (!selectedRestaurant) return;

        try {
            let listIdToSaveTo = selectedListId;

            if (isCreatingList) {
                if (!newListName.trim()) {
                    console.error("New list name cannot be empty.");
                    return;
                }
                const newList = await createList(newListName.trim());
                listIdToSaveTo = newList._id;
            }

            if (!listIdToSaveTo) {
                console.error("No list selected or created.");
                return;
            }

            await addVenueToList(listIdToSaveTo, selectedRestaurant._id);
            setIsSaveToListDialogOpen(false);
            setNewListName('');
            setIsCreatingList(false);
            fetchUserLists();
        } catch (error) {
            console.error("Failed to save to list:", error);
        }
    };

    const handleDeleteList = async (listId: string) => {
        try {
            await deleteList(listId);
            fetchUserLists();
        } catch (error) {
            console.error("Failed to delete list:", error);
        }
    };

    const handleRemoveVenue = async (listId: string, venueId: string) => {
        try {
            await removeVenueFromList(listId, venueId);
            fetchUserLists();
        } catch (error) {
            console.error("Failed to remove venue from list:", error);
        }
    };

    return {
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
        handleRemoveVenue,
        fetchUserLists
    };
};
