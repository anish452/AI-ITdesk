import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useAuth } from './lib/auth';
import { AdminPage } from './pages/AdminPage';
import { EmployeeHome } from './pages/EmployeeHome';
import { KnowledgePage } from './pages/KnowledgePage';
import { LoginPage } from './pages/LoginPage';
import { OperationsPage } from './pages/OperationsPage';
import { QueuePage } from './pages/QueuePage';
import { TicketPage } from './pages/TicketPage';

function StaffOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') return <Navigate to="/" replace />;
  return children;
}

function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'MANAGER' && user?.role !== 'ADMIN') return <Navigate to="/queue" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<EmployeeHome />} />
        <Route path="/tickets/:id" element={<TicketPage />} />
        <Route path="/queue" element={<StaffOnly><QueuePage /></StaffOnly>} />
        <Route path="/operations" element={<StaffOnly><OperationsPage /></StaffOnly>} />
        <Route path="/knowledge" element={<StaffOnly><KnowledgePage /></StaffOnly>} />
        <Route path="/admin" element={<ManagerOnly><AdminPage /></ManagerOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
