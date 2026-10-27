import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global safety shield: Intercepts accidental HTML responses (e.g. Capacitor SPA fallbacks) to prevent SyntaxError in .json()
if (typeof Response !== 'undefined' && Response.prototype && Response.prototype.json) {
  const origJson = Response.prototype.json;
  Response.prototype.json = async function () {
    try {
      const text = await this.text();
      const trimmed = (text || '').trim();
      if (trimmed.startsWith('<') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        console.warn('[Global JSON Shield] Interceptada resposta HTML inesperada:', trimmed.slice(0, 100));
        return { success: false, reason: 'html_fallback_intercepted', isHtmlFallback: true };
      }
      return JSON.parse(text);
    } catch (err: any) {
      console.warn('[Global JSON Shield] Falha de JSON parse:', err);
      return { success: false, error: err.message, isInvalidJson: true };
    }
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: 'always',
      staleTime: 5000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
