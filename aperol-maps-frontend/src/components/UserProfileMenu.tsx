/**
 * User Account Menu
 * 
 * A dropdown menu for user-specific actions like viewing saved lists, 
 * joining collaborative sessions, and logging out.
 */
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User, LogIn, LogOut, List, Sun, Moon, HelpCircle, MessageSquareWarning, Share2 } from "lucide-react";

interface UserProfileMenuProps {
    isAuthenticated: boolean;
    user: {
        name?: string | null;
    } | null;
    theme: 'light' | 'dark';
    onLogin: () => void;
    onLogout: () => void;
    onMyLists: () => void;
    onToggleTheme: () => void;
    onShareSession: () => void;
}

export const UserProfileMenu = ({
    isAuthenticated,
    user,
    theme,
    onLogin,
    onLogout,
    onMyLists,
    onToggleTheme,
    onShareSession
}: UserProfileMenuProps) => {

    if (!isAuthenticated) {
        return (
            <Button onClick={onLogin}>
                <LogIn className="mr-2 h-4 w-4" />
                Login
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                        <AvatarFallback>
                            {user?.name ? user.name[0].toUpperCase() : <User className="h-4 w-4" />}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none truncate">
                            {user?.name ?? "Welcome"}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => alert("Navigate to Account Settings")}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Account Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMyLists}>
                    <List className="mr-2 h-4 w-4" />
                    <span>My Lists</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShareSession}>
                    <Share2 className="mr-2 h-4 w-4" />
                    <span>Share Session</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onToggleTheme}>
                    {theme === 'light' ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                    <span>Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => alert("Navigate to Help Page")}>
                     <HelpCircle className="mr-2 h-4 w-4" />
                     <span>Help & Support</span>
                </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => alert("Open Feedback Form")}>
                     <MessageSquareWarning className="mr-2 h-4 w-4" />
                     <span>Submit Feedback</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};