import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2, Terminal, ArrowRight } from 'lucide-react';

export default function Home() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [selectedColor, setSelectedColor] = useState('#22d3ee'); // Default Cyan
  const navigate = useNavigate();

  const colorPalette = [
    '#22d3ee', // Cyan
    '#38bdf8', // Sky Blue
    '#a78bfa', // Purple
    '#f472b6', // Pink
    '#34d399', // Emerald
    '#fbbf24', // Amber
  ];

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!name.trim() || !roomId.trim()) return;

    // Cache developer profile configuration markers to session layer memory
    sessionStorage.setItem('cosphere_user_name', name.trim());
    sessionStorage.setItem('cosphere_user_color', selectedColor);

    // Dynamic routing redirect push
    navigate(`/room/${roomId.trim().toLowerCase()}`);
  };

  return (
    <div className="w-screen h-screen bg-[#0F172A] flex items-center justify-center font-sans overflow-hidden text-slate-200 p-4">
      {/* Structural Backdrop Radial Light Glow Matrix */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px] top-1/4 left-1/4 pointer-events-none" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[100px] bottom-1/4 right-1/4 pointer-events-none" />

      {/* Main Form Box Container Card */}
      <div className="w-full max-w-md border border-[#1E293B] bg-[#0F172A]/60 backdrop-blur-xl p-8 rounded-3xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-[#0F172A] shadow-lg shadow-cyan-500/20 mb-3">
            <Code2 size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Initialize CoSphere Session</h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">&gt; real_time_collaboration_matrix_online</p>
        </div>

        <form onSubmit={handleJoinRoom} className="space-y-5">
          {/* Identity Parameters Input Field */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 font-mono">Developer Handle</label>
            <input 
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Parth, Kernel_Nomad"
              className="w-full bg-[#1E293B]/40 border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:bg-[#1E293B]/60 transition-all"
            />
          </div>

          {/* Room Coordinate Assignment Input Field */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 font-mono">Target Room Code</label>
            <input 
              type="text"
              required
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="e.g., dev-sandbox, core-cluster"
              className="w-full bg-[#1E293B]/40 border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:bg-[#1E293B]/60 transition-all"
            />
          </div>

          {/* Real-time Caret Presence Color Picker Grid Matrix */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 font-mono">Caret Identity Color</label>
            <div className="flex items-center gap-3 bg-[#1E293B]/20 border border-[#1E293B]/40 p-3 rounded-xl justify-between">
              {colorPalette.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-6 h-6 rounded-full transition-transform duration-150 relative ${selectedColor === color ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110 active:scale-95'}`}
                />
              ))}
            </div>
          </div>

          {/* Core Submit Entry Trigger Action Execution Button */}
          <button
            type="submit"
            className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-[#0F172A] font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 transition-all group active:scale-[0.98]"
          >
            <Terminal size={16} /> Mount Workspace Workspace <ArrowRight size={16} className="transform group-hover:translate-x-0.5 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
}