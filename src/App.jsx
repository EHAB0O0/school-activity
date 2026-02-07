import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Scheduler from './components/Scheduler';
import StudentsPage from './pages/StudentsPage';
import AssetsPage from './pages/AssetsPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import PublicView from './pages/PublicView';

import NotificationManager from './components/NotificationManager';
import LoadingScreen from './components/ui/LoadingScreen';

function PrivateRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return currentUser ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/view" element={<PublicView />} />
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <PrivateRoute>
            <Layout />
            <NotificationManager />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="scheduler" element={<Scheduler />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
