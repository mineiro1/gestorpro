import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Ops, algo deu errado!</h2>
            <p className="text-gray-600 mb-6">
              Ocorreu um erro inesperado no aplicativo. Tente limpar o cache do seu aplicativo ou recarregar a página.
            </p>
            <div className="bg-gray-100 p-4 rounded-lg text-left overflow-auto text-xs text-red-600 mb-6 max-h-32">
              {this.state.error?.message || 'Erro desconhecido'}
            </div>
            <button
              onClick={() => {
                // Clear all local storage and cache, then reload
                localStorage.clear();
                sessionStorage.clear();
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) {
                      registration.unregister();
                    }
                  });
                }
                window.location.reload();
              }}
              className="w-full py-3 px-4 bg-primary text-white rounded-lg font-medium hover:bg-primary-light transition-colors"
            >
              Limpar Cache e Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
