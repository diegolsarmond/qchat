import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ReactElement, useEffect, useState } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { supabase, supabaseInitializationError } from "@/integrations/supabase/client";

type ProtectedRouteProps = {
  element: ReactElement;
};

const ProtectedRoute = ({ element }: ProtectedRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (supabaseInitializationError) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    let active = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setIsAuthenticated(Boolean(data.session));
      setIsLoading(false);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (!active) return;
      setIsAuthenticated(Boolean(session));
      setIsLoading(false);
    });

    loadSession();

    return () => {
      active = false;
      listener?.subscription.unsubscribe();
    };
  }, [supabaseInitializationError]);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    const navigateElement = <Navigate to="/login" replace />;
    if (typeof window === "undefined") {
      return { ...navigateElement, type: "Navigate" } as ReactElement;
    }
    return navigateElement;
  }

  return element;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<ProtectedRoute element={<Index />} />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export { ProtectedRoute };

export default App;
