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

    const localName = anonymousNames[Math.floor(Math.random() * anonymousNames.length)];
    const localColor = colors[Math.floor(Math.random() * colors.length)];

    provider.awareness.setLocalStateField('user', {
      name: localName,
      color: localColor,
      cursor: null
    });

    provider.on('status', (event) => {
      setConnected(event.status === 'connected');
    });

    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      const userList = [];
      states.forEach((state) => {
        if (state.user) userList.push(state.user);
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