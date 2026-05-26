import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { Code, BookOpen, Play, Cpu, Users, Terminal, Share2, MessageSquare, Send, X } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { yCollab } from 'y-codemirror.next';
import { Editor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import ReactMarkdown from 'react-markdown';

export default function Workspace() {
  const { roomId } = useParams();
  
  const { ydocRef, providerRef, connected, users } = useRoom(roomId);
  
  const [mode, setMode] = useState('code'); 
  const [language, setLanguage] = useState('javascript'); 
  const [terminalOutput, setTerminalOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 💬 Chat Panel State Layout Hooks
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  
  const editorRef = useRef(null);
  const cmViewRef = useRef(null);
  const chatEndRef = useRef(null);
  const [tiptapEditor, setTiptapEditor] = useState(null);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty('--x', `${x}%`);
    e.currentTarget.style.setProperty('--y', `${y}%`);
  };

  // Scroll down to the latest message whenever chat data list shifts
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatOpen]);

  useEffect(() => {
    const ydoc = ydocRef.current;
    const provider = providerRef.current;

    if (!ydoc || !provider) return;

    if (mode === 'code' && editorRef.current) {
      if (cmViewRef.current) {
        cmViewRef.current.destroy();
        cmViewRef.current = null;
      }

      const ytext = ydoc.getText('codemirror-shared');
      const state = EditorState.create({
        doc: ytext.toString(),
        extensions: [
          javascript(),
          yCollab(ytext, provider.awareness),
          EditorView.theme({
            "&": { backgroundColor: "#1B262C", color: "#BBE1FA", height: "100%" },
            ".cm-content": { caretColor: "#BBE1FA", fontFamily: "JetBrains Mono, monospace" },
            ".cm-cursor": { borderLeftColor: "#BBE1FA" },
            "&.cm-focused .cm-cursor": { borderLeftColor: "#BBE1FA" },
            ".cm-scroller": { overflow: "auto" }
          })
        ]
      });

      cmViewRef.current = new EditorView({ state, parent: editorRef.current });
    }

    if (!tiptapEditor) {
      const instance = new Editor({
        extensions: [
          StarterKit.configure({ history: false }),
          Collaboration.configure({ document: ydoc, field: 'tiptap-shared' })
        ],
        editorProps: {
          attributes: { class: 'focus:outline-none text-gray-200 min-h-[400px] p-4' }
        }
      });
      setTiptapEditor(instance);
    }

    // 💬 Hook custom message packet logic directly into your open socket stream
    const handleIncomingSocketData = (event) => {
      try {
        const uint8Msg = new Uint8Array(event.data);
        if (uint8Msg[0] === 2) { 
          const textDecoder = new TextDecoder();
          const jsonString = textDecoder.decode(uint8Msg.subarray(1));
          const parsedPayload = JSON.parse(jsonString);
          
          setChatMessages((prev) => [...prev, parsedPayload]);
        }
      } catch (err) {
        console.error('Failed to translate inbound application protocol chunk:', err);
      }
    };

    if (provider.ws) {
      provider.ws.addEventListener('message', handleIncomingSocketData);
    }

    return () => {
      if (cmViewRef.current && mode !== 'code') {
        cmViewRef.current.destroy();
        cmViewRef.current = null;
      }
      if (provider.ws) {
        provider.ws.removeEventListener('message', handleIncomingSocketData);
      }
    };
  }, [ydocRef, providerRef, tiptapEditor, mode]);

  useEffect(() => {
    return () => {
      if (tiptapEditor) {
        tiptapEditor.destroy();
      }
    };
  }, [tiptapEditor]);

  // 💬 Dispatch custom Chat Message across the shared WebSocket channel
  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !providerRef.current?.ws) return;

    const messageObject = {
      sender: providerRef.current.awareness.getLocalState()?.user?.name || 'Anonymous Coder',
      text: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      id: Math.random().toString(36).substr(2, 9)
    };

    setChatMessages((prev) => [...prev, messageObject]);

    const textEncoder = new TextEncoder();
    const textBuffer = textEncoder.encode(JSON.stringify(messageObject));
    const finalPayload = new Uint8Array(textBuffer.length + 1);
    finalPayload[0] = 2; 
    finalPayload.set(textBuffer, 1);

    providerRef.current.ws.send(finalPayload);
    setChatInput('');
  };

  const runCode = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setTerminalOutput('Compiling and routing to container execution pipeline...\n');
    try {
      const sourceCode = cmViewRef.current?.state.doc.toString() || '';
      const response = await fetch('http://localhost:5000/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: language, version: 'latest', files: [{ content: sourceCode }] })
      });
      const data = await response.json();
      if (data.run) {
        setTerminalOutput(data.run.stderr || data.run.stdout || 'Process completed with exit code 0');
      } else {
        setTerminalOutput('Unexpected response signature returned from compilation container.');
      }
    } catch (err) {
      console.error('Execution pipeline failure context:', err);
      setTerminalOutput('Execution pipeline timeout or network disconnect.');
    } finally {
      setIsRunning(false);
    }
  };
  
  const triggerAiReview = async () => {
    setIsAiLoading(true);
    setAiAnalysis('Analyzing context blocks...');
    try {
      const sourceCode = cmViewRef.current?.state.doc.toString() || '';
      const response = await fetch('http://localhost:5000/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: sourceCode, language: language })
      });
      const data = await response.json();
      setAiAnalysis(data.candidates?.[0]?.content?.parts?.[0]?.text || 'No review returned.');
    } catch (e) {
      console.error('AI analysis failure context:', e);
      setAiAnalysis('AI core parsing error.');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div onMouseMove={handleMouseMove} className="oceanic-spotlight w-screen h-screen flex flex-col selection:bg-brand-accent selection:text-white">
      {/* Dynamic Header Panel */}
      <header className="h-14 border-b border-brand-deep bg-brand-bg/80 backdrop-blur-md flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-brand-accent to-brand-ice flex items-center justify-center font-bold text-brand-bg text-lg">C</div>
          <span className="font-bold tracking-widest text-brand-ice text-lg">CoSphere</span>
          <div className="flex items-center gap-2 ml-4 px-2 py-0.5 rounded bg-brand-deep text-xs text-gray-300 border border-brand-accent/20">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}></span>
            Room: {roomId}
          </div>
          
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-brand-deep text-brand-ice text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-accent/20 focus:outline-none focus:border-brand-accent cursor-pointer">
            <option value="javascript">JavaScript (Node)</option>
            <option value="python">Python 3</option>
          </select>
        </div>

        {/* Dual Mode Selectors */}
        <div className="bg-brand-bg border border-brand-deep p-1 rounded-xl flex items-center gap-1">
          <button onClick={() => setMode('code')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${mode === 'code' ? 'bg-brand-accent text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
            <Code size={16} /> Code Canvas
          </button>
          <button onClick={() => setMode('notes')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${mode === 'notes' ? 'bg-brand-accent text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
            <BookOpen size={16} /> Shared Notes
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setIsChatOpen(!isChatOpen)} className={`relative flex items-center gap-2 bg-brand-deep border ${isChatOpen ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-accent/30'} text-brand-ice text-xs px-4 py-2 rounded-lg transition-transform active:scale-95`}>
            <MessageSquare size={14} /> Team Chat
          </button>
          <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="flex items-center gap-2 bg-brand-deep hover:bg-brand-accent border border-brand-accent/30 text-brand-ice text-xs px-4 py-2 rounded-lg transition-transform active:scale-95">
            <Share2 size={14} /> Invite Link
          </button>
        </div>
      </header>

      {/* Core Operational Grid */}
      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-60 border-r border-brand-deep bg-brand-bg/40 backdrop-blur-sm p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-ice font-semibold uppercase tracking-wider text-xs mb-4">
              <Users size={14} /> Team Members ({users.length})
            </div>
            <div className="space-y-2">
              {users.map((user, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-xl bg-brand-deep/30 border border-brand-deep/50">
                  <div className="w-3 h-3 rounded-full shadow-md" style={{ backgroundColor: user.color }} />
                  <span className="text-sm font-medium text-gray-200">{user.name}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={triggerAiReview} disabled={isAiLoading} className="w-full py-2.5 rounded-xl bg-linear-to-r from-brand-deep to-brand-accent border border-brand-accent/40 text-brand-ice font-medium text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all">
            <Cpu size={16} /> {isAiLoading ? 'Analyzing...' : 'Ask Gemini AI'}
          </button>
        </aside>

        {/* Text Area Canvas Sections */}
        <main className="flex-1 flex flex-col bg-brand-bg/20">
          <div className="flex-1 relative overflow-auto p-4">
            {mode === 'code' ? (
              <div ref={editorRef} className="w-full h-full text-base rounded-2xl border border-brand-deep/60 p-2 bg-brand-bg" />
            ) : (
              <div className="w-full h-full rounded-2xl border border-brand-deep/60 bg-brand-bg overflow-y-auto">
                {tiptapEditor && <EditorContent editor={tiptapEditor} />}
              </div>
            )}
          </div>

          <section className="h-65 border-t border-brand-deep bg-brand-bg/90 flex flex-col">
            <div className="h-10 border-b border-brand-deep bg-brand-bg flex items-center justify-between px-4">
              <div className="flex items-center gap-2 text-xs text-brand-ice font-mono"><Terminal size={14} /> stdout // sandboxed-runtime-output</div>
              <button onClick={runCode} disabled={isRunning} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 py-1 rounded-md shadow-md transition-all"><Play size={12} /> {isRunning ? 'Running...' : 'Run Engine'}</button>
            </div>
            <pre className="flex-1 p-4 font-mono text-sm text-emerald-400 bg-black/40 overflow-y-auto whitespace-pre-wrap terminal-glow">{terminalOutput || '> Code output stream awaits initialization.'}</pre>
          </section>
        </main>

        {/* AI Sidebar Diagnostics Overlay */}
        {aiAnalysis && (
          <aside className="w-[320px] border-l border-brand-deep bg-brand-bg/70 backdrop-blur-xl p-4 overflow-y-auto">
            <h3 className="text-sm font-bold text-brand-ice uppercase tracking-wider mb-3">Gemini Diagnostics</h3>
            <div className="prose prose-invert text-sm text-gray-300 leading-relaxed"><ReactMarkdown>{aiAnalysis}</ReactMarkdown></div>
          </aside>
        )}

        {/* 💬 Collapsible Sliding Live Team Chat Drawer Panel */}
        <div className={`absolute top-0 right-0 h-full w-[350px] bg-brand-bg/95 border-l border-brand-deep backdrop-blur-xl shadow-2xl flex flex-col z-20 transition-all duration-300 ease-in-out transform ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b border-brand-deep flex items-center justify-between bg-brand-deep/30">
            <div className="flex items-center gap-2 text-brand-ice font-semibold text-sm">
              <MessageSquare size={16} className="text-brand-accent" /> Live Communication Channel
            </div>
            <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-brand-ice transition-colors p-1 rounded-lg hover:bg-brand-deep"><X size={16} /></button>
          </div>

          {/* Chat Messages Log Scroll Layout */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 font-mono text-xs">
                &gt; Communication stream offline. No active sequences dispatched yet.
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="flex flex-col bg-brand-deep/20 border border-brand-deep/40 p-2.5 rounded-xl max-w-[90%]">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span className="text-xs font-bold text-brand-accent truncate">{msg.sender}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm text-gray-200 break-words font-sans">{msg.text}</p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message Input Submission Form block */}
          <form onSubmit={sendChatMessage} className="p-3 border-t border-brand-deep bg-brand-bg/60">
            <div className="flex items-center gap-2 rounded-xl bg-brand-deep/40 border border-brand-deep px-3 py-1.5 focus-within:border-brand-accent/60 transition-colors">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                placeholder="Type messages..." 
                className="flex-1 bg-transparent border-none text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
              />
              <button type="submit" disabled={!chatInput.trim()} className="text-brand-ice hover:text-brand-accent disabled:text-gray-600 disabled:hover:text-gray-600 transition-colors p-1"><Send size={14} /></button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}