import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import AppContent from './components/AppContent';
import AuthPage from './components/auth/AuthPage';

function App() {
    return (
    <AuthProvider>
      <Routes>
          {/* Public routes */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />

          {/* Protected routes */}
          <Route path="/prepare" element={<ProtectedRoute><AppContent initialView="extractor" initialStep="setup" /></ProtectedRoute>} />
          <Route path="/extract" element={<ProtectedRoute><AppContent initialView="extractor" initialStep="extract" /></ProtectedRoute>} />
          <Route path="/parametre" element={<ProtectedRoute><AppContent initialView="extractor" initialStep="dataprep" /></ProtectedRoute>} />
          <Route path="/update" element={<ProtectedRoute><AppContent initialView="miseajour" /></ProtectedRoute>} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/prepare" replace />} />
        </Routes>
    </AuthProvider>
  );
}

export default App;
