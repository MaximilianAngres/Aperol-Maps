/**
 * Session Sharing Utility
 * 
 * Generates and displays QR codes and shareable links for collaborative 
 * group sessions. Shows active participants in real-time.
 */
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSessionStore, type Participant } from '@/lib/store';
import { createSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { User } from '@/lib/types';

interface ShareSessionDialogProps {
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareSessionDialog({ currentUser, open, onOpenChange }: ShareSessionDialogProps) {
  const { sessionId, participants, connectToSession, leaveSession } = useSessionStore();
  const [joinCode, setJoinCode] = useState('');

  

  const handleCreateSession = async () => {
    if (!currentUser) {
      alert("You must be logged in to create a session.");
      return;
    }
    try {
      const { session_id } = await createSession();
      connectToSession(session_id);
    } catch (error) {
      console.error("Failed to create session:", error);
      alert("Could not create a new session. Please try again.");
    }
  };

  const handleJoinSession = () => {
    if (!currentUser) {
      alert("You must be logged in to join a session.");
      return;
    }
    if (!joinCode.trim()) return;
    connectToSession(joinCode.trim());
  };

  const publicOrigin = import.meta.env.VITE_PUBLIC_URL || window.location.origin;
  const shareUrl = sessionId ? `${publicOrigin}/join/${sessionId.substring(0, 5)}` : '';
  const shortCode = sessionId ? sessionId.substring(0, 5).toUpperCase() : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sessionId ? 'Share Session' : 'Join or Create a Session'}</DialogTitle>
          <DialogDescription>
            {sessionId
              ? "Share the session details with others so they can join."
              : "Create a new session to collaborate with others, or join an existing one with a code."
            }
          </DialogDescription>
        </DialogHeader>
        {sessionId ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <QRCodeSVG value={shareUrl} size={128} />
            </div>
            <div>
              <Label htmlFor="share-url">Share Link</Label>
              <Input id="share-url" readOnly value={shareUrl} />
            </div>
            <div>
              <Label htmlFor="short-code">Or use this code</Label>
              <Input id="short-code" readOnly value={shortCode} className="text-2xl font-bold text-center" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Participants</h3>
              <ul className="space-y-2">
                {participants.map((p: Participant) => (
                  <li key={p.email} className="p-2 border-2 rounded-md" style={{ borderColor: p.color, backgroundColor: p.color + '20' }}>
                    {p.email}
                  </li>
                ))}
              </ul>
            </div>
            <Button onClick={leaveSession} variant="destructive">Leave Session</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button onClick={handleCreateSession} className="w-full">Create New Session</Button>
            <div className="flex items-center space-x-2">
              <hr className="flex-grow" />
              <span>OR</span>
              <hr className="flex-grow" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="join-code">Join with Code</Label>
              <div className="flex space-x-2">
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter 5-letter code"
                />
                <Button onClick={handleJoinSession}>Join</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}