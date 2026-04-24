import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60 * 1000,  // 5 min — data is fresh, don't refetch constantly
      gcTime:               10 * 60 * 1000, // 10 min — keep unused queries in cache
      retry:                2,
      refetchOnWindowFocus: false,
    },
  },
});

const DevTools = () => {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return <ReactQueryDevtools initialIsOpen={false} />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    {import.meta.env.DEV && <DevTools />}
  </QueryClientProvider>
);

export default App;
