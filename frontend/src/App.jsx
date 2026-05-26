import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Workspace from './pages/Workspace';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Page Route - Redirects to a default room for easy local testing */}
        <Route path="/" element={<Navigate to="/room/dev-sandbox" replace />} />
        
        {/* Workspace Route matching your explicit /room/:roomId matrix blueprint */}
        <Route path="/room/:roomId" element={<Workspace />} />
        
        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}