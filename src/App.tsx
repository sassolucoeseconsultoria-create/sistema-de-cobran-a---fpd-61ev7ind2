/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

// Real Pages
import Index from '@/pages/Index'
import Vendedores from '@/pages/Vendedores'
import TopOfensores from '@/pages/TopOfensores'
import Importar from '@/pages/Importar'
import Arquivos from '@/pages/Arquivos'
import Relacionamento from '@/pages/Relacionamento'
import Lojas from '@/pages/Lojas'
import Admin from '@/pages/Admin'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Shell Routes */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Index />} />
            <Route path="/vendedores" element={<Vendedores />} />
            <Route path="/top-ofensores" element={<TopOfensores />} />
            <Route
              path="/importar"
              element={
                <ProtectedRoute requireRole="ADM" showRestrictedFeedback>
                  <Importar />
                </ProtectedRoute>
              }
            />
            <Route path="/arquivos" element={<Arquivos />} />
            <Route path="/relacionamento" element={<Relacionamento />} />
            <Route
              path="/lojas"
              element={
                <ProtectedRoute requireRole="ADM" showRestrictedFeedback>
                  <Lojas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireRole="ADM" showRestrictedFeedback>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
