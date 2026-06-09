import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { Code, BookOpen, Play, Cpu, Users, Terminal, Share2, MessageSquare, Send, X, Bot } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { yCollab } from 'y-codemirror.next';
import ReactMarkdown from 'react-markdown';

export default function Workspace() {
  const { roomId } = useParams();
  
  const { ydocRef, providerRef, connected, users } = useRoom(roomId);
  
  const [mode, setMode] = useState('code'); 
  const [language, setLanguage] = useState('javascript'); 
  const [terminalOutput, setTerminalOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  
  // Track client configuration locally to clear ESLint Ref-Render exceptions
  const [localClientID, setLocalClientID] = useState(null);

  // 🤖 AI Interactive Sidebar States
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Markdown Real-time Streaming State Parser Hook
  const [markdownText, setMarkdownText] = useState('');

  // 💬 Chat Panel State Layout Hooks
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  
  const editorRef = useRef(null);
  const notesEditorRef = useRef(null);
  const cmViewRef = useRef(null);
  const cmNotesViewRef = useRef(null);
  const chatEndRef = useRef(null);
  const aiEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty('--x', `${x}%`);
    e.currentTarget.style.setProperty('--y', `${y}%`);
  };

  // Capture local ClientID safely as soon as the provider establishes connection parameters
  useEffect(() => {
    if (providerRef.current?.awareness) {
      setLocalClientID(providerRef.current.awareness.clientID);
    }
  }, [connected, providerRef]);

  // Scroll down to the latest message whenever chat data list shifts
  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  // Scroll down AI window when new analysis lands
  useEffect(() => {
    if (isAiOpen) {
      aiEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiAnalysis, isAiOpen]);

  // Clean layout instances and reset typing state markers on component dismount sequences
  useEffect(() => {
    const activeProvider = providerRef.current;
    const activeTimeout = typingTimeoutRef.current;
    return () => {
      if (activeTimeout) clearTimeout(activeTimeout);
      if (activeProvider?.awareness) {
        activeProvider.awareness.setLocalStateField('typing', false);
      }
    };
  }, [providerRef]);

  useEffect(() => {
    const ydoc = ydocRef.current;
    const provider = providerRef.current;

    if (!ydoc || !provider) return;

    const localAwareness = provider.awareness;

    // Broadcasts a typing activity state token safely via Yjs awareness matrix channels
    const broadcastTypingActivity = () => {
      const localState = localAwareness.getLocalState();
      if (!localState?.typing) {
        localAwareness.setLocalStateField('typing', true);
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        localAwareness.setLocalStateField('typing', false);
      }, 2000);
    };

    // 📝 PANEL A: Code Canvas Real-time Mount Vector
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
          yCollab(ytext, localAwareness),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              broadcastTypingActivity();
            }
          }),
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

    // 📑 PANEL B: Shared Notes Split Markdown Canvas Mount Vector
    if (mode === 'notes' && notesEditorRef.current) {
      if (cmNotesViewRef.current) {
        cmNotesViewRef.current.destroy();
        cmNotesViewRef.current = null;
      }

      const yNotesText = ydoc.getText('codemirror-notes-shared');
      setMarkdownText(yNotesText.toString());

      const notesState = EditorState.create({
        doc: yNotesText.toString(),
        extensions: [
          yCollab(yNotesText, localAwareness),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setMarkdownText(update.state.doc.toString());
              broadcastTypingActivity();
            }
          }),
          EditorView.theme({
            "&": { backgroundColor: "#111827", color: "#E5E7EB", height: "100%" },
            ".cm-content": { caretColor: "#67e8f9", fontFamily: "JetBrains Mono, monospace", padding: "12px" },
            ".cm-cursor": { borderLeftColor: "#67e8f9" },
            "&.cm-focused .cm-cursor": { borderLeftColor: "#67e8f9" },
            ".cm-scroller": { overflow: "auto" }
          }),
          EditorView.lineWrapping
        ]
    });

      cmNotesViewRef.current = new EditorView({ state: notesState, parent: notesEditorRef.current });
    }

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
      if (cmNotesViewRef.current && mode !== 'notes') {
        cmNotesViewRef.current.destroy();
        cmNotesViewRef.current = null;
      }
      if (provider.ws) {
        provider.ws.removeEventListener('message', handleIncomingSocketData);
      }
    };
  }, [ydocRef, providerRef, mode]);

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
  
  const triggerAiReview = async (e) => {
    if (e) e.preventDefault();
    
    const rawCode = (mode === 'code') 
      ? (cmViewRef.current?.state.doc.toString() || '')
      : (cmNotesViewRef.current?.state.doc.toString() || '');
      
    const sourceCode = rawCode.trim();
    const customPrompt = aiPrompt.trim();

    if (!sourceCode) {
      setAiAnalysis(`### Workspace Canvas Empty\n\n> Please insert code or text inside the **${mode === 'code' ? 'Code Canvas' : 'Shared Notes'}** workspace so Gemini has reference data to parse!`);
      return;
    }

    if (!customPrompt) return;

    setIsAiLoading(true);
    setAiAnalysis((prev) => prev + `\n\n--- \n\n**🙋‍♂️ Question:** ${customPrompt}\n\n⏳ *Thinking...*`);
    setAiPrompt('');
    
    try {
      const response = await fetch('http://localhost:5000/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: sourceCode, 
          language: (mode === 'code' ? language : 'markdown'),
          prompt: customPrompt 
        })
      });
      
      const data = await response.json();
      
      let answer = '';
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        answer = data.candidates[0].content.parts[0].text;
      } else if (data?.explanation) {
        answer = data.explanation;
      } else if (data?.error?.message) {
        answer = `\`Backend API Exception:\` ${data.error.message}`;
      } else {
        answer = "AI parsing anomaly occurred. Ensure your `GEMINI_API_KEY` environment parameter is active.";
      }
      
      setAiAnalysis((prev) => prev.replace('⏳ *Thinking...*', '') + `\n\n**🤖 Gemini Copilot:**\n${answer}`);
    } catch (e) {
      console.error('AI analysis failure context:', e);
      setAiAnalysis((prev) => prev.replace('⏳ *Thinking...*', '') + '\n\n❌ **AI processing error. Verify backend engines are running.**');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div onMouseMove={handleMouseMove} className="oceanic-spotlight w-screen h-screen flex flex-col bg-[#0F172A] text-slate-100 overflow-hidden selection:bg-brand-accent selection:text-white">
      {/* Header Panel */}
      <header className="h-14 border-b border-[#1E293B] bg-[#0F172A]/80 backdrop-blur-md flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-[#0F172A] text-lg">C</div>
          <span className="font-bold tracking-widest text-cyan-400 text-lg">CoSphere</span>
          <div className="flex items-center gap-2 ml-4 px-2 py-0.5 rounded bg-[#1E293B] text-xs text-gray-300 border border-cyan-500/20">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}></span>
            Room: {roomId}
          </div>
          
          {mode === 'code' && (
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-[#1E293B] text-cyan-100 text-xs font-semibold px-3 py-1.5 rounded-lg border border-cyan-500/20 focus:outline-none focus:border-cyan-400 cursor-pointer">
              <option value="javascript">JavaScript (Node)</option>
              <option value="python">Python 3</option>
            </select>
          )}
        </div>

        {/* Workspace Mode Control Elements */}
        <div className="bg-[#0F172A] border border-[#1E293B] p-1 rounded-xl flex items-center gap-1">
          <button onClick={() => setMode('code')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${mode === 'code' ? 'bg-cyan-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
            <Code size={16} /> Code Canvas
          </button>
          <button onClick={() => setMode('notes')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${mode === 'notes' ? 'bg-cyan-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
            <BookOpen size={16} /> Shared Notes
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setIsChatOpen(!isChatOpen)} className={`flex items-center gap-2 bg-[#1E293B] border ${isChatOpen ? 'border-cyan-400 bg-cyan-500/10' : 'border-cyan-500/30'} text-cyan-100 text-xs px-4 py-2 rounded-lg transition-transform active:scale-95`}>
            <MessageSquare size={14} /> Team Chat
          </button>
          <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="flex items-center gap-2 bg-[#1E293B] hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-100 text-xs px-4 py-2 rounded-lg transition-transform active:scale-95">
            <Share2 size={14} /> Invite Link
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Left Side Menu */}
        <aside className="w-60 border-r border-[#1E293B] bg-[#0F172A]/40 backdrop-blur-sm p-4 flex flex-col justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 font-semibold uppercase tracking-wider text-xs mb-4">
              <Users size={14} /> Team Members ({users.length})
            </div>
            <div className="space-y-2">
              {users.map((user, idx) => (
                <div key={user.clientID || idx} className="flex items-center gap-3 p-2 rounded-xl bg-[#1E293B]/30 border border-[#1E293B]/50">
                  <div className="w-3 h-3 rounded-full shadow-md" style={{ backgroundColor: user.color }} />
                  <span className="text-sm font-medium text-gray-200 truncate">{user.name}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setIsAiOpen(!isAiOpen)} className={`w-full py-2.5 rounded-xl border font-medium text-sm flex items-center justify-center gap-2 transition-all ${isAiOpen ? 'bg-cyan-500 text-[#0F172A] border-cyan-400' : 'bg-linear-to-r from-[#1E293B] to-cyan-600 border-cyan-500/40 text-cyan-100 hover:brightness-110'}`}>
            <Cpu size={16} /> Ask Gemini AI
          </button>
        </aside>

        {/* Workspace Central Components */}
        <main className="flex-1 flex flex-col bg-[#0F172A]/20 min-w-0 overflow-hidden relative">
          <div className="flex-1 relative p-4 overflow-hidden">
            {mode === 'code' ? (
              <div className="w-full h-full flex flex-col relative">
                <div ref={editorRef} className="flex-1 text-base rounded-2xl border border-[#1E293B]/60 p-2 bg-brand-bg overflow-hidden" />
                
                <section className="h-56 mt-4 border border-[#1E293B] rounded-2xl bg-[#0F172A]/90 flex flex-col overflow-hidden shrink-0">
                  <div className="h-10 border-b border-[#1E293B] bg-[#0F172A] flex items-center justify-between px-4">
                    <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono"><Terminal size={14} /> stdout // sandboxed-runtime-output</div>
                    <button onClick={runCode} disabled={isRunning} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 py-1 rounded-md shadow-md transition-all"><Play size={12} /> {isRunning ? 'Running...' : 'Run Engine'}</button>
                  </div>
                  <pre className="flex-1 p-4 font-mono text-sm text-emerald-400 bg-black/40 overflow-y-auto whitespace-pre-wrap">{terminalOutput || '> Code output stream awaits initialization.'}</pre>
                </section>
              </div>
            ) : (
              <div className="w-full h-full flex gap-4 overflow-hidden relative">
                <div className="flex-1 flex flex-col min-w-0 h-full">
                  <div className="text-xs text-slate-400 font-mono mb-1 uppercase tracking-wider">&gt;_ markdown_source_editor</div>
                  <div ref={notesEditorRef} className="flex-1 rounded-2xl border border-[#1E293B]/80 bg-[#111827] overflow-hidden p-1 shadow-inner" />
                </div>
                <div className="flex-1 flex flex-col min-w-0 h-full">
                  <div className="text-xs text-cyan-400 font-mono mb-1 uppercase tracking-wider">&gt;_ real_time_compiled_view</div>
                  <div className="flex-1 rounded-2xl border border-[#1E293B]/60 bg-[#1E293B]/20 p-6 overflow-y-auto prose prose-invert prose-cyan max-w-none shadow-lg leading-relaxed">
                    {markdownText.trim() ? <ReactMarkdown>{markdownText}</ReactMarkdown> : <div className="h-full flex items-center justify-center text-center font-mono text-xs text-slate-500 p-4">Waiting for markdown structure inputs...</div>}
                  </div>
                </div>
              </div>
            )}

            {/* 📡 Option B: Aggregated Bottom Status Bar Overlay Panel */}
            {users.filter(u => u.isTyping && u.clientID !== localClientID).length > 0 && (
              <div className="absolute bottom-6 left-6 bg-[#0F172A]/90 border border-cyan-500/30 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-2xl z-50 transition-all duration-300 ease-in-out animate-pulse">
                <p className="text-xs text-slate-300 flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                  <span className="font-mono text-cyan-300">
                    {users
                      .filter(u => u.isTyping && u.clientID !== localClientID)
                      .map(u => u.name)
                      .join(', ')}
                    {users.filter(u => u.isTyping && u.clientID !== localClientID).length === 1 ? ' is ' : ' are '} 
                    typing...
                  </span>
                </p>
              </div>
            )}
          </div>
        </main>

        {/* 🤖 Interactive Gemini Copilot Chat Sidebar Layout Panel */}
        <div className={`h-full border-l border-[#1E293B] bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isAiOpen ? 'w-95 opacity-100' : 'w-0 opacity-0 overflow-hidden pointer-events-none'}`}>
          <div className="p-4 border-b border-[#1E293B] bg-[#1E293B]/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
              <Bot size={16} /> Gemini Interactive Copilot
            </div>
            <button onClick={() => setIsAiOpen(false)} className="text-gray-400 hover:text-cyan-400 transition-colors p-1 rounded-lg hover:bg-[#1E293B]"><X size={16} /></button>
          </div>

          {/* Dialog Log Box Area */}
          <div className="flex-1 p-4 overflow-y-auto text-sm space-y-4 min-h-0 min-w-0 scrollbar-thin">
            {!aiAnalysis ? (
              <div className="text-xs font-mono text-slate-500 bg-slate-900/50 rounded-xl border border-[#1E293B] p-4">
                &gt; AI core linked to active editor instance buffer. Type an operational query below (e.g., *'explain this code step by step'*) to submit context sequences.
              </div>
            ) : (
              <div className="prose prose-invert prose-cyan max-w-none text-xs text-slate-200 leading-relaxed wrap-break-word bg-[#1E293B]/20 p-3 rounded-2xl border border-[#1E293B]/40">
                <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
              </div>
            )}
            <div ref={aiEndRef} />
          </div>

          {/* 📥 Custom Question Prompt Dialog Submission Form Box */}
          <form onSubmit={triggerAiReview} className="p-3 border-t border-[#1E293B] bg-[#0F172A]/60">
            <div className="flex items-center gap-2 rounded-xl bg-[#1E293B]/40 border border-[#1E293B] px-3 py-2 focus-within:border-cyan-500/60 transition-colors">
              <input 
                type="text" 
                value={aiPrompt} 
                onChange={(e) => setAiPrompt(e.target.value)} 
                placeholder={isAiLoading ? "Processing query..." : "Ask Gemini about your code..."}
                disabled={isAiLoading}
                className="w-full bg-transparent border-none text-xs text-gray-200 placeholder-slate-500 focus:outline-none disabled:cursor-not-allowed"
              />
              <button type="submit" disabled={isAiLoading || !aiPrompt.trim()} className="text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 transition-colors p-1">
                <Send size={14} />
              </button>
            </div>
          </form>
        </div>

        {/* Live Side Team Chat Communication Panel */}
        <div className={`h-full border-l border-[#1E293B] bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isChatOpen ? 'w-87.5 opacity-100 visibility-visible' : 'w-0 opacity-0 overflow-hidden pointer-events-none'}`}>
          <div className="p-4 border-b border-[#1E293B] flex items-center justify-between bg-[#1E293B]/30 whitespace-nowrap">
            <div className="flex items-center gap-2 text-cyan-100 font-semibold text-sm">
              <MessageSquare size={16} className="text-cyan-400" /> Live Communication Channel
            </div>
            <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-cyan-100 transition-colors p-1 rounded-lg hover:bg-[#1E293B]"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 font-mono text-xs whitespace-normal">&gt; Communication stream offline. No active sequences dispatched yet.</div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="flex flex-col bg-[#1E293B]/20 border border-brand-deep/40 p-2.5 rounded-xl max-w-[90%]">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span className="text-xs font-bold text-cyan-400 truncate">{msg.sender}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm text-gray-200 wrap-break-word font-sans">{msg.text}</p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChatMessage} className="p-3 border-t border-[#1E293B] bg-[#0F172A]/60 whitespace-nowrap">
            <div className="flex items-center gap-2 rounded-xl bg-[#1E293B]/40 border border-brand-deep px-3 py-1.5 focus-within:border-cyan-500/60 transition-colors">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type messages..." className="flex-1 bg-transparent border-none text-sm text-gray-200 placeholder-gray-500 focus:outline-none" />
              <button type="submit" disabled={!chatInput.trim()} className="text-cyan-100 hover:text-cyan-400 disabled:text-gray-600 transition-colors p-1"><Send size={14} /></button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}