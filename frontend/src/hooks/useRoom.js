import { useEffect, useState, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const BACKEND_WS = "ws://localhost:5000";

const colors = ['#3282B8', '#BBE1FA', '#F56565', '#48BB78', '#ED64A6', '#ECC94B'];
const anonymousNames = ['Quantum Coder', 'Binary Voyager', 'Matrix Scholar', 'Pixel Guru', 'Kernel Nomad'];

export function useRoom(roomId) {
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const ydocRef = useRef(new Y.Doc());
  const providerRef = useRef(null);

  useEffect(() => {
    const doc = ydocRef.current;
    const provider = new WebsocketProvider(BACKEND_WS, roomId, doc);
    providerRef.current = provider;

    // Hydrate custom handles from session storage memory blocks or fallback dynamically
    const localName = sessionStorage.getItem('cosphere_user_name') || anonymousNames[Math.floor(Math.random() * anonymousNames.length)];
    const localColor = sessionStorage.getItem('cosphere_user_color') || colors[Math.floor(Math.random() * colors.length)];

    // Initialize state structure containing baseline user data mapping rules
    provider.awareness.setLocalStateField('user', {
      name: localName,
      color: localColor,
      cursor: null
    });
    
    // Explicitly initialize typing state flag as false to keep schema unified
    provider.awareness.setLocalStateField('typing', false);

    provider.on('status', (event) => {
      setConnected(event.status === 'connected');
    });

    // Listens to global state shifts across clients, aggregating identifiers and typing flags
    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      const userList = [];

      states.forEach((state, clientID) => {
        if (state.user) {
          userList.push({
            clientID: clientID,               // Essential layout key tracking parameter for lists
            name: state.user.name,
            color: state.user.color,
            cursor: state.user.cursor,
            isTyping: !!state.typing          // Safely catch the root level typing boolean flag
          });
        }
      });
      setUsers(userList);
    });

    return () => {
      provider.disconnect();
      doc.destroy();
    };
  }, [roomId]);

  // Clean, error-free return mapping
  return {
    ydocRef,
    providerRef,
    connected,
    users
  };
}