/**
 * Venue Recommendations & Ratings
 * 
 * Allows users to view and submit "Thumbs Up/Down" ratings and comments 
 * for specific restaurants.
 */
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import type { Recommendation } from '@/lib/types';
import { fetchRecommendations, submitRecommendation } from '@/lib/api';

interface RecommendationViewProps {
    /** The unique identifier of the venue to fetch/submit recommendations for */
    venueId: string;
    /** Current authentication status to enable/disable submission UI */
    isAuthenticated: boolean;
}

/**
 * RecommendationView manages the display and submission of community feedback 
 * for a specific venue. It handles asynchronous data fetching and form submission 
 * for user reviews.
 */
export const RecommendationView = ({ venueId, isAuthenticated }: RecommendationViewProps) => {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [newRecommendation, setNewRecommendation] = useState<{ rating: 'up' | 'down' | 'neutral'; comment: string }>({ 
        rating: 'neutral', 
        comment: '' 
    });

    // Fetch existing recommendations when the component mounts or venue changes
    useEffect(() => {
        const getRecommendations = async () => {
            try {
                const data = await fetchRecommendations(venueId);
                setRecommendations(data);
            } catch (error) {
                console.error('Failed to fetch recommendations:', error);
            }
        };
        if (venueId) {
            getRecommendations();
        }
    }, [venueId]);

    /**
     * Validates and submits a new user recommendation to the backend.
     * Updates the local state immediately upon successful submission for responsive feedback.
     */
    const handleSubmitRecommendation = async () => {
        if (!isAuthenticated) {
            alert('You must be logged in to submit a recommendation.');
            return;
        }
        if (newRecommendation.rating === 'neutral' || !newRecommendation.comment.trim()) {
            alert('Please select a rating and write a comment.');
            return;
        }
        try {
            const newRec = await submitRecommendation(venueId, newRecommendation);
            setRecommendations([...recommendations, newRec]);
            setNewRecommendation({ rating: 'neutral', comment: '' }); 
        } catch (error) {
            console.error('Failed to submit recommendation:', error);
            alert('Failed to submit recommendation.');
        }
    };

    return (
        <div className="py-4">
            <div className="flex items-center">
                <div className="flex-grow border-t border-border"></div>
                <span className="px-2 text-xs text-muted-foreground">Community Feedback</span>
                <div className="flex-grow border-t border-border"></div>
            </div>

            {/* List of existing recommendations */}
            <div className="py-2 pr-4">
                {recommendations.length > 0 ? (
                    recommendations.map((rec) => (
                        <div key={rec._id} className="border-b border-border py-2">
                            <div className="flex items-center">
                                {rec.rating === 'up' && <ThumbsUp className="h-4 w-4 text-green-500" />}
                                {rec.rating === 'down' && <ThumbsDown className="h-4 w-4 text-red-500" />}
                                <span className="ml-2 text-sm text-foreground">{rec.comment}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-center text-muted-foreground py-2">No recommendations yet.</p>
                )}
            </div>

            {/* Recommendation submission form (authenticated users only) */}
            {isAuthenticated && (
                <div className="pt-4 pr-4">
                    <div className="flex space-x-2">
                        <Button
                            variant={newRecommendation.rating === 'up' ? 'default' : 'outline'}
                            size="icon"
                            onClick={() => setNewRecommendation({ ...newRecommendation, rating: 'up' })}
                        >
                            <ThumbsUp className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={newRecommendation.rating === 'down' ? 'destructive' : 'outline'} 
                            size="icon"
                            onClick={() => setNewRecommendation({ ...newRecommendation, rating: 'down' })}
                        >
                            <ThumbsDown className="h-4 w-4" />
                        </Button>
                    </div>
                    <Textarea
                        className="mt-2"
                        placeholder="Add a comment..."
                        value={newRecommendation.comment}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewRecommendation({ ...newRecommendation, comment: e.target.value })}
                    />
                    <Button className="mt-2" onClick={handleSubmitRecommendation}>
                        Submit
                    </Button>
                </div>
            )}
        </div>
    );
};
