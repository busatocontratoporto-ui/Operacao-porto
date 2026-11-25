import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useOfflineSync } from "./hooks/useOfflineSync";
import AppLayout from "./components/layout/AppLayout";
import Index from "./pages/Index";
import Configuracoes from "./pages/Configuracoes";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import FuncionarioProfile from "./pages/FuncionarioProfile";
import Eventos from "./pages/Eventos";
import Colaboradores from "./pages/Colaboradores";
import Ponto from "./pages/Ponto";
import LancamentoPontoExterno from "./pages/LancamentoPontoExterno";
import Ferias from "./pages/Ferias";
import Atestados from "./pages/Atestados";
import EvolucaoContrato from "./pages/EvolucaoContrato";
import GestaoNotificacoes from "./pages/GestaoNotificacoes";
import CCO from "./pages/CCO";
import { InstallPWA } from "./components/InstallPWA";
import { PWAUpdateHandler } from "./components/PWAUpdateHandler";
import { PageGuard } from "./components/auth/PageGuard";
import { usePermissions } from "./hooks/usePermissions";

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { hasError: boolean; errorId: string; errorMessage: string; errorStack: string }
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, errorId: "", errorMessage: "", errorStack: "" };
  }
  static getDerivedStateFromError(error: Error) {
    const errorId = Math.random().toString(36).substring(2, 8).toUpperCase();
    return {
      hasError: true,
      errorId,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack || "",
    };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Erro capturado:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 max-w-2xl p-8">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-2xl font-bold text-foreground">Algo deu errado</h1>
            <p className="text-muted-foreground text-sm">
              Ocorreu um erro inesperado. Por favor, tire um print dessa tela e envie para o suporte.
            </p>
            <div className="bg-destructive/10 text-destructive text-left p-4 rounded-md overflow-auto max-h-48 text-xs font-mono">
              <p className="font-bold mb-1">Error: {this.state.errorMessage}</p>
              <pre className="whitespace-pre-wrap">{this.state.errorStack}</pre>
            </div>
            <p className="text-xs text-muted-foreground font-mono">Código: {this.state.errorId}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const { canView } = usePermissions();
  if (loading) return null;
  if (!isAdmin && !canView("admin")) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  useOfflineSync();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<PageGuard pageKey="dashboard"><Index /></PageGuard>} />

          {/* Gestão de Pessoas */}
          <Route path="/colaboradores" element={<PageGuard pageKey="colaboradores"><Colaboradores /></PageGuard>} />
          <Route path="/cadastro" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/funcionario/:id" element={<PageGuard pageKey="colaboradores"><FuncionarioProfile /></PageGuard>} />
          <Route path="/ponto" element={<PageGuard pageKey="ponto"><Ponto /></PageGuard>} />
          <Route path="/ferias" element={<PageGuard pageKey="ferias"><Ferias /></PageGuard>} />
          <Route path="/atestados" element={<PageGuard pageKey="atestados"><Atestados /></PageGuard>} />
          <Route path="/ausencias" element={<Navigate to="/ponto" replace />} />
          <Route path="/organograma" element={<Navigate to="/colaboradores" replace />} />

          {/* Operações, Contratos & SSMA */}
          <Route path="/cco" element={<PageGuard pageKey="cco"><CCO /></PageGuard>} />
          <Route path="/cco/:tab" element={<PageGuard pageKey="cco"><CCO /></PageGuard>} />
          <Route path="/eventos" element={<PageGuard pageKey="eventos"><Eventos /></PageGuard>} />
          <Route path="/evolucao" element={<PageGuard pageKey="evolucao"><EvolucaoContrato /></PageGuard>} />
          <Route path="/notificacoes" element={<PageGuard pageKey="notificacoes"><GestaoNotificacoes /></PageGuard>} />

          {/* Sistema */}
          <Route path="/configuracoes" element={<PageGuard pageKey="configuracoes"><Configuracoes /></PageGuard>} />
          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />

          {/* Redirecionamento limpo de URLs antigas desativadas */}
          <Route path="/desempenho/*" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/feedbacks/*" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/treinamentos" element={<Navigate to="/eventos" replace />} />
          <Route path="/assessments" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/disc/*" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/sucessao" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/cadastro-metas" element={<Navigate to="/colaboradores" replace />} />
          <Route path="/novo" element={<Navigate to="/colaboradores" replace />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <InstallPWA />
      <PWAUpdateHandler />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/lancamento-ponto/:token" element={<LancamentoPontoExterno />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
