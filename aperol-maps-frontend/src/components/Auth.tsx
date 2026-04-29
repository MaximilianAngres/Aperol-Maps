/**
 * Authentication Dialogs
 * 
 * Handles user login and registration forms. Communicates with the 
 * API's /register and /login endpoints to manage user sessions.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser, registerUser } from "@/lib/api";

interface AuthProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess: (token: string) => void;
}

export function Auth({ onAuthSuccess, open, onOpenChange }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      let response;
      if (isLogin) {
        response = await loginUser({ email, password });
      } else {
        await registerUser({ email, password });
        response = await loginUser({ email, password });
      }

      if (response.token) {
        onAuthSuccess(response.token);
        onOpenChange(false);
      } else {
        setError("Login failed: No token received.");
      }

    } catch (err: any) {
      if (err.response) {
        if (err.response.status === 409) {
          setError("An account with this email already exists.");
        } else {
          setError("Invalid email or password.");
        }
      } else {
        setError("An unexpected network error occurred. Please try again.");
      }
      console.error(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isLogin ? "Log In" : "Sign Up"}</DialogTitle>
            <DialogDescription>
              {isLogin ? "Enter your credentials to log in." : "Create an account to get started."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input id="email" type="email" className="col-span-3" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input id="password" type="password" className="col-span-3" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-red-500 text-sm col-span-4">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="link" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Need an account?" : "Already have an account?"}
            </Button>
            <Button type="submit">{isLogin ? "Log In" : "Sign Up"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}