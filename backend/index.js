import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws'; 
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import * as Y from 'yjs';

// Import the official Supabase Client engine
import { createClient } from '@supabase/supabase-js';

// Import standard sub-protocol codecs from y-protocols and lib0
import syncProtocol from 'y-protocols/dist/sync.cjs';
import encoding from 'lib0/dist/encoding.cjs';
import decoding from 'lib0/dist/decoding.cjs';

// Native Node.js utilities for secure local file execution
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Supabase Infrastructure Bridge Interface Safely
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    }) 
  : null;

if (!supabase) {
  console.warn("⚠️ Database Warning: SUPABASE_URL or ANON_KEY missing from env parameters. Running in memory-only fallback mode.");
}

const rooms = new Map();

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database_connected: !!supabase, timestamp: new Date() });
});

// Dynamic Multi-Language Local Execution Engine (JS & Python)
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

    exec(`${executionCommand} "${tempFilePath}"`, { timeout: 4000 }, (error, stdout, stderr) => {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      if (error && error.killed) {
        return res.json({
          run: { stdout: '', stderr: 'Runtime Exception: Execution terminated. Script exceeded 4-second safety limit.' }
        });
      }

      res.json({
        run: { stdout: stdout || '', stderr: stderr || (error ? error.message : '') }
      });
    });
  } catch (error) {
    console.error('Local Compilation System Failure:', error);
    res.status(500).json({ error: 'Internal sandbox execution pipeline fault' });
  }
});

// Proxy route for Gemini 2.0 Flash
app.post('/api/ai/explain', async (req, res) => {
  const { code, language } = req.body;
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key is missing on the host environment.' });
  }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Explain this ${language} code fragment cleanly and detect bugs:\n\`\`\`${language}\n${code}\n\`\`\`` }]
        }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.3 }
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Gemini Core API Proxy Failure:', error);
    res.status(500).json({ error: 'AI Analysis engine failure' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Custom Protocol Tag Mappings
const messageSync = 0;
const messageChat = 2; // Tag 2 skips Yjs decoding and handles instant messaging routing loops

wss.on('connection', async (ws, req) => {
  const urlParts = req.url.split('/');
  const roomId = urlParts[urlParts.length - 1] || 'default-room';

  if (!rooms.has(roomId)) {
    const doc = new Y.Doc();
    rooms.set(roomId, { doc, clients: new Set() });

    if (supabase) {
      console.log(`🔍 Querying database persistence vector records for room: ${roomId}`);
      try {
        const { data, error } = await supabase
          .from('cosphere_rooms')
          .select('ydoc_state')
          .eq('room_id', roomId)
          .maybeSingle();

        if (error) throw error;
        if (data && data.ydoc_state) {
          const binaryBuffer = Buffer.from(data.ydoc_state, 'base64');
          Y.applyUpdate(doc, new Uint8Array(binaryBuffer));
          console.log(`📦 Database State Hydrated successfully for room [${roomId}]`);
        }
      } catch (dbErr) {
        console.error(`⚠️ Failed to retrieve database sync vector record map:`, dbErr);
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

      // 💬 ROUTE A: Chat Message Stream Protocol Packet
      if (messageType === messageChat) {
        // Skip Yjs text decoder parsing entirely! Simply broadcast raw buffer out to other clients.
        for (const client of room.clients) {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(uint8Msg);
          }
        }
        return; // Complete routing execution pass
      }

      // 📝 ROUTE B: Standard Real-Time Yjs Document Changes
      if (messageType === messageSync) {
        const decoder = decoding.createDecoder(uint8Msg.subarray(1));
        const replyEncoder = encoding.createEncoder();
        
        encoding.writeVarUint(replyEncoder, messageSync);
        syncProtocol.readSyncMessage(decoder, replyEncoder, room.doc, ws);
        
        if (encoding.toUint8Array(replyEncoder).length > 1) {
          ws.send(encoding.toUint8Array(replyEncoder));
        }
      }

      // Replicate document state delta arrays across alternative cloned instances
      for (const client of room.clients) {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(uint8Msg);
        }
      }
    } catch (err) {
      console.error('Sync parsing anomaly handled securely:', err);
    }
  });

  ws.on('close', async () => {
    room.clients.delete(ws);
    
    if (room.clients.size === 0) {
      console.log(`🛑 Room empty: [${roomId}]. Compiling state array variables for database storage flush...`);
      if (supabase) {
        try {
          const stateUpdate = Y.encodeStateAsUpdate(room.doc);
          const base64State = Buffer.from(stateUpdate).toString('base64');
          const { error } = await supabase
            .from('cosphere_rooms')
            .upsert({ room_id: roomId, ydoc_state: base64State, updated_at: new Date().toISOString() }, { onConflict: 'room_id' });
          if (error) throw error;
          console.log(`💾 State safely backed up inside Supabase for room [${roomId}]`);
        } catch (saveErr) {
          console.error(`⚠️ Automation save failure to Supabase schema:`, saveErr);
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
  console.error('Server execution exception intercept:', err);
});

server.listen(port, () => {
  console.log(`CoSphere Orchestrator online at port ${port}`);
});