import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws'; 
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import * as Y from 'yjs';
import { createClient } from '@supabase/supabase-js';
import syncProtocol from 'y-protocols/dist/sync.cjs';
import encoding from 'lib0/dist/encoding.cjs';
import decoding from 'lib0/dist/decoding.cjs';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 5000;

// FIXED: Robust CORS Configuration explicitly opening channels to all your dev ports
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    }) 
  : null;

const rooms = new Map();

app.get('/api/debug-env', (req, res) => {
  const keyExists = !!process.env.GEMINI_API_KEY;
  const keyLength = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0;
  res.json({
    gemini_key_detected: keyExists,
    gemini_key_length: keyLength,
    database_connected: !!supabase,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database_connected: !!supabase });
});

// Robust Multi-Language Runner with Windows Command Fallbacks
app.post('/api/execute', (req, res) => {
  try {
    const sourceCode = req.body.files?.[0]?.content || '';
    const rawLang = (req.body.language || 'javascript').toLowerCase();
    
    let extension = '.js';
    let executionCommand = 'node';

    if (rawLang.includes('py') || rawLang.includes('python')) {
      extension = '.py';
      executionCommand = process.platform === 'win32' ? 'python' : 'python3';
    }

    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${extension}`;
    const tempFilePath = path.join(process.cwd(), tempFileName);

    fs.writeFileSync(tempFilePath, sourceCode, 'utf-8');

    const runScript = (cmd) => {
      exec(`${cmd} "${tempFilePath}"`, { timeout: 4000 }, (error, stdout, stderr) => {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        if (error) {
          if (error.killed) {
            return res.json({ run: { stdout: '', stderr: 'Runtime Exception: Execution safety limit (4s) exceeded.' } });
          }
          
          if (process.platform === 'win32' && cmd === 'python' && (error.code === 'ENOENT' || error.message.includes('not recognized'))) {
            fs.writeFileSync(tempFilePath, sourceCode, 'utf-8');
            return runScript('py');
          }
          
          return res.json({ run: { stdout: stdout || '', stderr: stderr || error.message } });
        }
        
        res.json({ run: { stdout: stdout || '', stderr: '' } });
      });
    };

    runScript(executionCommand);

  } catch (error) {
    console.error("Runner execution block collision error:", error);
    res.status(500).json({ error: 'Internal sandbox execution pipeline fault' });
  }
});

// Context-Aware Gemini API Proxy
app.post('/api/ai/explain', async (req, res) => {
  const { code, language, prompt } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ 
      explanation: "Linter Alert: The `GEMINI_API_KEY` system parameter is undefined inside the active server instance." 
    });
  }

  const instruction = prompt ? prompt : "Explain this code snippet cleanly and highlight errors.";
  const formattedSystemContent = `You are an elite, context-aware AI programming copilot embedded inside CoSphere IDE.\n\n[CONTEXT CODE TEMPLATE]\nLanguage: ${language || 'source code'}\nSource Code:\n\`\`\`\n${code || ''}\n\`\`\`\n\n[USER INSTRUCTION]\n${instruction}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: formattedSystemContent }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 }
      })
    });

    const data = await response.json();
    
    if (data && data.candidates?.[0]?.content?.parts?.[0]?.text) {
      res.json(data);
    } else {
      const explicitErrorMessage = data?.error?.message || 'Invalid response formatting from core AI provider models matrix.';
      res.status(200).json({ 
        explanation: `🤖 **Gemini Cloud Rejection Notice:**\n\n> ${explicitErrorMessage}`
      });
    }
  } catch (error) {
    console.error('Gemini Proxy Bridge Pipeline Fault:', error);
    res.status(500).json({ error: 'AI analysis communication channel pipeline fault.' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const messageSync = 0;
const messageChat = 2;

wss.on('connection', async (ws, req) => {
  const urlParts = req.url.split('/');
  const roomId = urlParts[urlParts.length - 1] || 'default-room';

  if (!rooms.has(roomId)) {
    const doc = new Y.Doc();
    rooms.set(roomId, { doc, clients: new Set() });

    if (supabase) {
      try {
        const { data, error } = await supabase.from('cosphere_rooms').select('ydoc_state').eq('room_id', roomId).maybeSingle();
        if (!error && data?.ydoc_state) {
          Y.applyUpdate(doc, new Uint8Array(Buffer.from(data.ydoc_state, 'base64')));
        }
      } catch (dbErr) {
        console.error(`Database State Hydration Anomaly:`, dbErr);
      }
    }
  }
  
  const room = rooms.get(roomId);
  room.clients.add(ws);

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  ws.send(encoding.toUint8Array(encoder));

  ws.on('message', (rawMessage) => {
    try {
      const uint8Msg = new Uint8Array(rawMessage);
      const messageType = uint8Msg[0];

      if (messageType === messageChat) {
        for (const client of room.clients) {
          if (client !== ws && client.readyState === ws.OPEN) client.send(uint8Msg);
        }
        return;
      }

      if (messageType === messageSync) {
        const decoder = decoding.createDecoder(uint8Msg.subarray(1));
        const replyEncoder = encoding.createEncoder();
        encoding.writeVarUint(replyEncoder, messageSync);
        syncProtocol.readSyncMessage(decoder, replyEncoder, room.doc, ws);
        if (encoding.toUint8Array(replyEncoder).length > 1) {
          ws.send(encoding.toUint8Array(replyEncoder));
        }
      }

      for (const client of room.clients) {
        if (client !== ws && client.readyState === ws.OPEN) client.send(uint8Msg);
      }
    } catch (err) {
      console.error('Sync network anomaly handled:', err);
    }
  });

  ws.on('close', async () => {
    room.clients.delete(ws);
    if (room.clients.size === 0) {
      if (supabase) {
        try {
          const base64State = Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64');
          await supabase.from('cosphere_rooms').upsert({ room_id: roomId, ydoc_state: base64State, updated_at: new Date().toISOString() });
        } catch (saveErr) {
          console.error(`Supabase persistence flush fault:`, saveErr);
        }
      }
      rooms.delete(roomId);
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`--- CRITICAL ERROR: Port ${port} is currently locked by a dead background process. ---`);
    console.error(`Run 'taskkill /F /IM node.exe' in your terminal to force clear it!`);
  }
});

server.listen(port, () => console.log(`CoSphere Orchestrator online at port ${port}`));