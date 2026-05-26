import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Workspace from './pages/Workspace';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Page Route - Now mounts the user profile & credentials initialization screen */}
        <Route path="/" element={<Home />} />
        
        {/* Workspace Route matching your explicit /room/:roomId matrix blueprint */}
        <Route path="/room/:roomId" element={<Workspace />} />
        
        {/* Catch-all fallback - Routes invalid structures smoothly back to the Home terminal layout */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
