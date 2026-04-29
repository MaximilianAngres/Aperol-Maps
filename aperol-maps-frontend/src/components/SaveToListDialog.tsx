/**
 * List Management Interface
 * 
 * A dialog for adding restaurants to user-created lists. Allows selecting 
 * existing lists or creating a new one with a custom description.
 */
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserList, MatchResult } from "@/lib/types";

interface SaveToListDialogProps {
    isSaveToListDialogOpen: boolean;
    setIsSaveToListDialogOpen: (isOpen: boolean) => void;
    selectedRestaurant: MatchResult | null;
    userLists: UserList[];
    selectedListId: string | null;
    setSelectedListId: (id: string | null) => void;
    newListName: string;
    setNewListName: (name: string) => void;
    isCreatingList: boolean;
    setIsCreatingList: (isCreating: boolean) => void;
    handleSaveToList: () => void;
}

export const SaveToListDialog = ({
    isSaveToListDialogOpen,
    setIsSaveToListDialogOpen,
    selectedRestaurant,
    userLists,
    selectedListId,
    setSelectedListId,
    newListName,
    setNewListName,
    isCreatingList,
    setIsCreatingList,
    handleSaveToList
}: SaveToListDialogProps) => {
    return (
        <Dialog open={isSaveToListDialogOpen} onOpenChange={setIsSaveToListDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Save to a List</DialogTitle>
                    <DialogDescription>
                        Select an existing list or create a new one to save '{selectedRestaurant?.name}'.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="flex items-center space-x-2">
                        <input
                            type="radio"
                            id="existing-list-radio"
                            name="list-choice"
                            checked={!isCreatingList}
                            onChange={() => setIsCreatingList(false)}
                        />
                        <Label htmlFor="existing-list-radio">Add to existing list</Label>
                    </div>

                    <Select
                        onValueChange={setSelectedListId}
                        defaultValue={selectedListId ?? undefined}
                        disabled={isCreatingList}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select a list..." />
                        </SelectTrigger>
                        <SelectContent>
                            {userLists.map(list => (
                                <SelectItem key={list._id} value={list._id}>
                                    {list.name} ({list.venues.length} venues)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex items-center space-x-2">
                        <input
                            type="radio"
                            id="new-list-radio"
                            name="list-choice"
                            checked={isCreatingList}
                            onChange={() => setIsCreatingList(true)}
                        />
                        <Label htmlFor="new-list-radio">Create a new list</Label>
                    </div>

                    <Input
                        placeholder="New list name..."
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        disabled={!isCreatingList}
                    />
                </div>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => setIsSaveToListDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveToList}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};