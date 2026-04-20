// src/components/AuthGate.tsx
//
// Wraps content that requires authentication.
// Renders children when the user is signed in, fallback when signed out.
//
// Created in Session C, wired up in Session D to gate write operations
// (ratings, memories, attendance logging). Not yet placed in the component
// tree — exists so Session D can import and place it without creating
// new infrastructure mid-session.
//
// Usage (Session D+):
//   <AuthGate fallback={<button onClick={() => setShowAuth(true)}>Sign in to rate</button>}>
//     <RatingStars ... />
//   </AuthGate>
//
// The loading state renders a minimal pulse to avoid layout shift during
// the initial auth check on page load.

import { useAuth } from "@/hooks/useAuth";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export const AuthGate = ({ children, fallback = null }: Props) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="stamp animate-pulse text-muted-foreground">···</div>
      </div>
    );
  }

  if (!user) return <>{fallback}</>;

  return <>{children}</>;
};
