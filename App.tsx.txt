/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Bot, 
  MessageSquare, 
  Zap, 
  Shield, 
  Users, 
  Clock, 
  Settings, 
  Search, 
  LayoutDashboard, 
  Puzzle, 
  Activity,
  Terminal,
  ChevronRight,
  Database,
  Smartphone,
  QrCode,
  Link as LinkIcon,
  RefreshCw,
  X,
  CreditCard,
  Plus,
  Copy,
  Check
} from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState('Checking...');
  const [connection, setConnection] = useState<{qr: string | null, pairingCode: string | null, connected: boolean, pairingNumber: string | null, user?: {id: string, name: string}}>({
    qr: null,
    pairingCode: null,
    connected: false,
    pairingNumber: null
  });
  const [sessions, setSessions] = useState<any[]>([]);
  const [newSessionName, setNewSessionName] = useState('');
  const [pairingSessionId, setPairingSessionId] = useState('default_bot');
  const [showPairing, setShowPairing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isRestarting, setIsRestarting] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ isFirestoreUsable: boolean; projectId: string | null; clientEmail: string | null; intasendMode?: string | null } | null>(null);

  const [stats, setStats] = useState({ totalCommands: 12400, activeUsers: 842, uptime: 0, latency: 48 });
  const [plugins, setPlugins] = useState<any[]>([]);
  const [aiConfig, setAiConfig] = useState<any>(null);

  // --- TERMINAL MULTI-TENANCY STATES ---
  const [terminals, setTerminals] = useState<any[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalData, setTerminalData] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Terminal Forms Creator States
  const [newTerminalId, setNewTerminalId] = useState('');
  const [newTerminalName, setNewTerminalName] = useState('');
  const [newTerminalOperator, setNewTerminalOperator] = useState('');
  const [newTerminalWeeklyRate, setNewTerminalWeeklyRate] = useState(5);
  const [newTerminalSetupFee, setNewTerminalSetupFee] = useState(10);

  // Terminal Mini-Dashboard deploy states
  const [terminalBotId, setTerminalBotId] = useState('');
  const [terminalPhone, setTerminalPhone] = useState('');
  const [terminalPaymentPending, setTerminalPaymentPending] = useState(false);
  const [terminalActiveSession, setTerminalActiveSession] = useState<any>(null);
  const [terminalVerificationStatus, setTerminalVerificationStatus] = useState<string | null>(null);
  const [isSimulator, setIsSimulator] = useState(false);

  // Standalone Pairing link only state (requested by user)
  const [isPairingViewOnly, setIsPairingViewOnly] = useState(false);
  const [pairingViewSessionId, setPairingViewSessionId] = useState('');
  const [pairingInputPhone, setPairingInputPhone] = useState('');
  const [isActivatingStream, setIsActivatingStream] = useState(false);
  const [isTerminalQRInitializing, setIsTerminalQRInitializing] = useState(false);
  const [localPairingCode, setLocalPairingCode] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clientNameInput, setClientNameInput] = useState('');
  const [clientPhoneInput, setClientPhoneInput] = useState('');
  const [isDetailsSubmitted, setIsDetailsSubmitted] = useState(false);

  useEffect(() => {
    // 1. Detect if terminal parameters exist
    const urlParams = new URLSearchParams(window.location.search);
    const termParam = urlParams.get('terminal');
    const invoiceParam = urlParams.get('invoice_id');
    const simParam = urlParams.get('is_simulator');

    if (simParam === 'true') {
      setIsSimulator(true);
    }

    const pairingViewParam = urlParams.get('pairing_view');
    const sessionParam = urlParams.get('session');

    if (pairingViewParam === 'true' && sessionParam) {
      setIsPairingViewOnly(true);
      setPairingViewSessionId(sessionParam);
      
      // Fetch session metadata if exists
      fetch(`/api/sessions/${sessionParam}/metadata`)
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('No metadata');
        })
        .then(data => {
          if (data && data.clientName) {
            setClientNameInput(data.clientName);
            setClientPhoneInput(data.clientPhone);
            setPairingInputPhone(data.clientPhone);
            setIsDetailsSubmitted(true);
            
            // Automatically bootstrap & activate stream in the background
            fetch('/api/sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: sessionParam, terminalId: termParam || 'main_terminal' })
            }).catch(err => console.error('Auto initializing direct pairing session failed:', err));
          }
        })
        .catch(err => console.warn('No metadata retrieved or initial setup required:', err.message));
    }

    if (termParam) {
      setActiveTerminalId(termParam);
      fetch(`/api/terminals/${termParam}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setTerminalData(data);
          }
        })
        .catch(err => console.error('Error fetching single terminal details:', err));
    } else {
      // 2. Load owner terminals database
      fetch('/api/terminals')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTerminals(data);
        })
        .catch(err => console.error('Error loading terminals list:', err));
    }

    // 3. Handle automated IntaSend checkout redirection loop
    if (invoiceParam) {
      setTerminalVerificationStatus('verifying');
      fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoiceParam, terminalId: termParam })
      })
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          setTerminalVerificationStatus('success');
          // Populate from details to ease quick deployment
          if (resData.transaction?.sessionId) {
            setTerminalBotId(resData.transaction.sessionId);
          }
          if (resData.transaction?.phoneNumber) {
            setTerminalPhone(resData.transaction.phoneNumber);
          }
        } else {
          setTerminalVerificationStatus('failed');
        }
      })
      .catch(() => setTerminalVerificationStatus('failed'));
    }

    const safeFetch = async (url: string) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`Fetch failed for ${url}:`, err);
            throw err;
        }
    };

    const checkStatus = () => {
        safeFetch('/api/connection')
          .then(data => {
            setConnection(data);
            if (data.connected) {
                setStatus('Online (DANSCOM Running)');
            }
          })
          .catch(() => setStatus('Connection Error'));

        safeFetch('/api/health')
          .then(hData => {
            setDbStatus({
              isFirestoreUsable: hData.isFirestoreUsable,
              projectId: hData.projectId,
              clientEmail: hData.clientEmail,
              intasendMode: hData.intasendMode
            });
            setConnection(prev => {
              if (!prev.connected) {
                setStatus(hData.status);
              }
              return prev;
            });
          })
          .catch(() => {
            setConnection(prev => {
              if (!prev.connected) {
                setStatus('Connecting...');
              }
              return prev;
            });
          });

        safeFetch('/api/sessions')
          .then(data => {
            if (Array.isArray(data)) {
                setSessions(data);
            }
          })
          .catch(() => {});

        safeFetch('/api/payments/transactions')
          .then(data => {
            if (Array.isArray(data)) {
                setTransactions(data);
            }
          })
          .catch(() => {});

        safeFetch('/api/stats')
          .then(data => setStats(data))
          .catch(() => {});
    };

    safeFetch('/api/plugins').then(setPlugins).catch(() => {});
    safeFetch('/api/ai-config').then(setAiConfig).catch(() => {});

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestPairingCode = async () => {
    if (!phoneNumber) return;
    setIsRequestingPairing(true);
    setPairingError(null);
    try {
      const res = await fetch('/api/request-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phoneNumber, sessionId: pairingSessionId })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || 'Failed to request pairing code');
      }

      const data = await res.json();
      if (data.code) {
        setConnection(prev => ({ ...prev, pairingCode: data.code }));
        setSessions(prev => prev.map(s => s.sessionId === pairingSessionId ? { ...s, pairingCode: data.code } : s));
      } else {
        setPairingError(data.error || 'Failed to generate code. Is your phone number correct?');
      }
    } catch (error: any) {
      console.error('Request pairing error:', error);
      setPairingError(error.message || 'Network error. Please check your internet connection.');
    } finally {
      setIsRequestingPairing(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      if (pairingSessionId && pairingSessionId !== 'default_bot') {
        await fetch(`/api/sessions/${pairingSessionId}/restart`, { method: 'POST' });
      } else {
        await fetch('/api/restart', { method: 'POST' });
      }
      setPhoneNumber('');
      setPairingError(null);
    } catch (error) {
      console.error('Restart error:', error);
    } finally {
      setTimeout(() => setIsRestarting(false), 2000);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName) return;
    const cleanName = newSessionName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanName) return;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: cleanName })
      });
      if (res.ok) {
        setNewSessionName('');
        const sessionsRes = await fetch('/api/sessions');
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          if (Array.isArray(data)) setSessions(data);
        }
      }
    } catch (error) {
        console.error('Failed to create session:', error);
    }
  };

  const handleDeleteSession = async (sessId: string) => {
    if (sessId === 'default_bot') {
      alert('The primary/default session cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete session "${sessId}"?`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.sessionId !== sessId));
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleCreateTerminal = async () => {
    if (!newTerminalId || !newTerminalName) {
      alert('Terminal ID and Name are required!');
      return;
    }
    try {
      const res = await fetch('/api/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newTerminalId,
          name: newTerminalName,
          operatorName: newTerminalOperator,
          weeklyRate: newTerminalWeeklyRate,
          setupFee: newTerminalSetupFee
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTerminals(prev => [...prev, data]);
        setNewTerminalId('');
        setNewTerminalName('');
        setNewTerminalOperator('');
        setNewTerminalWeeklyRate(5);
        setNewTerminalSetupFee(10);
      }
    } catch (e) {
      console.error('Failed creating terminal', e);
    }
  };

  const copyTerminalLink = (id: string) => {
    const link = `${window.location.origin}?terminal=${id}`;
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- START TERMINAL FLOW HELPERS ---
  const handleTerminalActivateQRStream = async () => {
    if (!terminalBotId) {
      alert('Bot Key Identifier is required first!');
      return;
    }
    setIsTerminalQRInitializing(true);
    setPairingError(null);
    try {
      // 1. start session automatically in backend database
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: terminalBotId, terminalId: activeTerminalId || 'main_terminal' })
      });
      // sleep to let WebWASocket boot up QR
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Refresh session
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setSessions(data);
      }
    } catch (err: any) {
      setPairingError(err.message || 'Failed to initialize QR Code connection.');
    } finally {
      setIsTerminalQRInitializing(false);
    }
  };

  const handleTerminalRequestPairingCode = async () => {
    if (!terminalBotId || !terminalPhone) {
      alert('Bot Key ID and WhatsApp Phone number are required!');
      return;
    }
    setIsRequestingPairing(true);
    setPairingError(null);
    try {
      // 1. start session automatically in backend database
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: terminalBotId, terminalId: activeTerminalId || 'main_terminal' })
      });

      // 2. request standard pairings token
      const res = await fetch('/api/request-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: terminalPhone, sessionId: terminalBotId })
      });
      const data = await res.json();
      if (data.code) {
        setTerminalActiveSession({ pairingCode: data.code, connected: false });
        setSessions(prev => {
          const exists = prev.some(s => s.sessionId === terminalBotId);
          if (!exists) {
            return [...prev, { sessionId: terminalBotId, pairingCode: data.code, connected: false, terminalId: activeTerminalId || 'main_terminal' }];
          }
          return prev.map(s => s.sessionId === terminalBotId ? { ...s, pairingCode: data.code } : s);
        });
        // Refresh sessions to register pairing state change
        const sRes = await fetch('/api/sessions');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (Array.isArray(sData)) setSessions(sData);
        }
      } else {
        setPairingError(data.error || 'Pairing token generated offline timeout. Check system details.');
      }
    } catch (err: any) {
      setPairingError(err.message || 'Failed to request numeric Pairing Code.');
    } finally {
      setIsRequestingPairing(false);
    }
  };

  const handleTerminalCreateCheckout = async () => {
    if (!terminalBotId || !terminalPhone) {
      alert('Bot Key ID and WhatsApp Phone JID are required!');
      return;
    }
    setTerminalPaymentPending(true);
    try {
      const charge = terminalData.setupFee > 0 ? terminalData.setupFee : terminalData.weeklyRate;
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: charge,
          phoneNumber: terminalPhone,
          sessionId: terminalBotId,
          terminalId: activeTerminalId,
          type: terminalData.setupFee > 0 ? 'setup' : 'weekly'
        })
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl + `&terminal=${activeTerminalId}`;
      } else {
        alert(data.error || 'Failed to initiate secure checkout pipeline.');
      }
    } catch (err: any) {
      console.error('Checkout failed:', err);
    } finally {
      setTerminalPaymentPending(false);
    }
  };
  // --- END TERMINAL FLOW HELPERS ---

  // --- RENDERING STANDALONE PAIRING CONSOLE ONLY VIEW (Strict request by user) ---
  if (isPairingViewOnly) {
    const activeSessState = sessions.find(s => s.sessionId === pairingViewSessionId);
    
    // Quick helper to activate/wake-up session
    const handleActivateSession = async () => {
      setIsActivatingStream(true);
      setPairingError(null);
      try {
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: pairingViewSessionId, terminalId: activeTerminalId || 'main_terminal' })
        });
        
        // Brief sleep to allow connection startup
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Refresh session
        const res = await fetch('/api/sessions');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setSessions(data);
        }
      } catch (err: any) {
        setPairingError(err.message || 'Failed to activate secure websocket stream.');
      } finally {
        setIsActivatingStream(false);
      }
    };

    const handleReqPairingCodeOnly = async () => {
      if (!pairingInputPhone) {
        alert('Please specify a valid WhatsApp mobile number first!');
        return;
      }
      setIsRequestingPairing(true);
      setPairingError(null);
      try {
        // Automatically make sure session is active
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: pairingViewSessionId, terminalId: activeTerminalId || 'main_terminal' })
        });

        const res = await fetch('/api/request-pairing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: pairingInputPhone, sessionId: pairingViewSessionId })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Request rejected by gateway' }));
          throw new Error(errData.error || 'Pairing token request failed.');
        }

        const data = await res.json();
        if (data.code) {
          setLocalPairingCode(data.code);
          setSessions(prev => {
            const exists = prev.some(s => s.sessionId === pairingViewSessionId);
            if (!exists) {
              return [...prev, { sessionId: pairingViewSessionId, pairingCode: data.code, connected: false, terminalId: activeTerminalId || 'main_terminal' }];
            }
            return prev.map(s => s.sessionId === pairingViewSessionId ? { ...s, pairingCode: data.code } : s);
          });
        } else {
          setPairingError(data.error || 'Failed to generate PIN. Please try again or check number.');
        }
      } catch (err: any) {
        setPairingError(err.message || 'Integration timeout. Verify details and try again.');
      } finally {
        setIsRequestingPairing(false);
      }
    };

    const handleDetailsSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!clientNameInput.trim()) {
        alert('Please enter your Name!');
        return;
      }
      if (!clientPhoneInput.trim()) {
        alert('Please enter your WhatsApp Phone Number!');
        return;
      }
      
      setIsRequestingPairing(true);
      setPairingError(null);
      try {
        // 1. Save metadata on server
        await fetch(`/api/sessions/${pairingViewSessionId}/metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName: clientNameInput, clientPhone: clientPhoneInput })
        });
        
        // 2. Reflect on input
        setPairingInputPhone(clientPhoneInput);
        
        // 3. Start session on server
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: pairingViewSessionId, terminalId: activeTerminalId || 'main_terminal' })
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. Request pairing PIN automatically
        const res = await fetch('/api/request-pairing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: clientPhoneInput, sessionId: pairingViewSessionId })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Request rejected' }));
          throw new Error(errData.error || 'Pairing PIN generation failed.');
        }

        const data = await res.json();
        if (data.code) {
          setLocalPairingCode(data.code);
          setIsDetailsSubmitted(true);
          
          // Refresh sessions
          const sessRes = await fetch('/api/sessions');
          if (sessRes.ok) {
            const resultData = await sessRes.json();
            if (Array.isArray(resultData)) setSessions(resultData);
          }
        } else {
          setPairingError(data.error || 'Failed to generate pairing PIN.');
        }
      } catch (err: any) {
        setPairingError(err.message || 'Failed to start stream or configure numbers.');
      } finally {
        setIsRequestingPairing(false);
      }
    };

    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans flex flex-col justify-start">
        {/* Custom Isolated connection bar */}
        <nav className="h-20 bg-white border-b border-slate-200/60 flex items-center justify-between px-6 md:px-12 select-none">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                // Return to terminal or admin
                setIsPairingViewOnly(false);
              }}
              className="p-2 hover:bg-slate-100 rounded-xl border border-slate-200/80 text-slate-600 transition-all flex items-center gap-1.5 text-xs font-bold mr-2 uppercase"
            >
              ← Go Back
            </button>
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-black">
              🔋
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-800 uppercase leading-none">
                Pair Session: {pairingViewSessionId}
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                STATUS: {activeSessState?.connected ? '🟢 ONLINE' : '⚙️ STANDBY'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100/50 rounded-full">
            <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider animate-pulse">DIRECT CONNECTION PORTAL</span>
          </div>
        </nav>

        <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12 space-y-8 animate-fade-in">
          
          {/* Header intro info */}
          <div className="text-center md:text-left space-y-2">
            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded font-black tracking-widest uppercase inline-block">DEVICE AUTH HUB</span>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Connect your WhatsApp Device</h2>
            <p className="text-xs text-slate-400 font-medium max-w-2xl leading-relaxed">
              Scan the dynamic QR code directly or request a secure numeric pairing code pin. Choose either method to securely link your device.
            </p>
          </div>

          {/* Quick status feedback banner */}
          {activeSessState?.connected ? (
            <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-[2rem] text-center select-none space-y-4 shadow-sm animate-fade-in max-w-2xl mx-auto">
              <span className="text-4xl">🎉</span>
              <p className="text-sm font-black text-emerald-800 uppercase tracking-widest mt-1">DEVICE LINKED SUCCESSFULLY</p>
              <div className="max-w-md mx-auto p-4 bg-white rounded-2xl border border-emerald-100 text-left space-y-2 text-slate-900 shadow-sm">
                <p className="text-xs">
                  <strong className="uppercase">Operator Name:</strong> {clientNameInput || activeSessState?.clientName || "User Connected"}
                </p>
                <p className="text-xs font-mono">
                  <strong className="font-sans uppercase">WhatsApp Number:</strong> {clientPhoneInput || activeSessState?.clientPhone || activeSessState?.pairingNumber || "Connected JID"}
                </p>
              </div>
              <p className="text-[10.5px] text-slate-500 uppercase font-black tracking-widest leading-relaxed bg-amber-50 rounded-xl py-3.5 px-4 border border-amber-100/60 transition-all max-w-lg mx-auto text-amber-800 text-center">
                🔒 SECURITY ENFORCED: This pairing link is now locked because it is in use. It cannot connect other bots unless this bot session is disconnected or deleted from the main terminal.
              </p>
            </div>
          ) : !isDetailsSubmitted ? (
            /* PLACE TO ENTER NAME AND PHONE NUMBER - CLEAN AND RESTRICTED */
            <div className="bg-white rounded-[2.5rem] border border-slate-200/60 shadow-xl p-8 max-w-md mx-auto space-y-6">
              <div className="text-center space-y-1">
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Enter Your Details</h3>
                <p className="text-xs text-slate-400">Provide your name and phone number to start pairing</p>
              </div>

              <form onSubmit={handleDetailsSubmit} className="space-y-4 text-left">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 label text-left">Operator Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe"
                    required
                    value={clientNameInput}
                    onChange={(e) => setClientNameInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 label text-left">WhatsApp Mobile Number</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 254712345678"
                    required
                    value={clientPhoneInput}
                    onChange={(e) => setClientPhoneInput(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono text-slate-900"
                  />
                </div>

                {pairingError && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-[10px] font-bold text-center">
                    {pairingError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isRequestingPairing}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] cursor-pointer text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {isRequestingPairing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating pairing codes...
                    </>
                  ) : (
                    "🚀 Create Pairing and QR Code"
                  )}
                </button>
              </form>
            </div>
          ) : null}

          {/* Central Grid holding only QR Code & Pairing Code Methods */}
          {!activeSessState?.connected && isDetailsSubmitted && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            
            {/* METHOD A: SCAN QR CODE */}
            <div className={`bg-white rounded-[2.5rem] border ${activeSessState?.connected ? 'border-slate-100 opacity-60' : 'border-slate-200/60 shadow-xl'} p-8 flex flex-col justify-between text-center space-y-6 relative overflow-hidden`}>
              <div className="space-y-2">
                <span className="text-[9px] bg-slate-900 text-white px-2.5 py-0.5 rounded font-black tracking-wider uppercase">METHOD A</span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Scan QR Code</h3>
                <p className="text-[11px] text-slate-400 font-medium">Link instantly using WhatsApp web scan utility</p>
              </div>

              {activeSessState?.connected ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-2xl mb-2">✓</div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Linked and active</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-4 bg-slate-50/50 rounded-3xl border border-slate-100 p-4">
                  {activeSessState?.qr ? (
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                      <QRCodeSVG value={activeSessState.qr} size={200} />
                      <p className="text-[9px] text-slate-400 font-semibold mt-3 uppercase tracking-wider animate-pulse">Refreshes automatically</p>
                    </div>
                  ) : (
                    <div className="text-center py-10 space-y-4">
                      <QrCode className="w-10 h-10 text-slate-350 mx-auto animate-pulse" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Stream Standby</p>
                        <p className="text-[9px] text-slate-450 mt-1 max-w-[200px] mx-auto leading-normal">Websocket stream has not started or is loading credentials.</p>
                      </div>
                      <button
                        onClick={handleActivateSession}
                        disabled={isActivatingStream}
                        className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md inline-flex items-center justify-center gap-1.5"
                      >
                        {isActivatingStream ? <RefreshCw className="w-3 h-3 animate-spin" /> : '🔌 Initialize QR Stream'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="text-[10px] text-slate-400 leading-normal px-4">
                Open WhatsApp &gt; Menu &gt; Linked Devices &gt; Scan QR code.
              </div>
            </div>

            {/* METHOD B: REQUEST PIN CODE */}
            <div className={`bg-white rounded-[2.5rem] border ${activeSessState?.connected ? 'border-slate-100 opacity-60' : 'border-slate-200/60 shadow-xl'} p-8 flex flex-col justify-between space-y-6 relative overflow-hidden`}>
              <div className="space-y-2 text-center">
                <span className="text-[9px] bg-slate-900 text-white px-2.5 py-0.5 rounded font-black tracking-wider uppercase">METHOD B</span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Request Pairing PIN</h3>
                <p className="text-[11px] text-slate-400 font-medium">Link with your phone number and an 8-character pin</p>
              </div>

              {activeSessState?.connected ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-2xl mb-2">•_•</div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Device connected</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center space-y-4 bg-slate-50/50 rounded-3xl border border-slate-100 p-6">
                  {activeSessState?.pairingCode || localPairingCode ? (
                    <div className="text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <label className="text-[9px] font-black text-slate-405 uppercase tracking-widest block leading-none">Your 8-Character Pin Key</label>
                      <p className="text-3xl font-mono tracking-widest font-black text-indigo-600 select-all">{activeSessState?.pairingCode || localPairingCode}</p>
                      <p className="text-[9px] text-slate-400 font-semibold leading-normal">Enter this pin on your WhatsApp Link with Phone Number screen.</p>
                      <button
                        onClick={handleReqPairingCodeOnly}
                        disabled={isRequestingPairing}
                        className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 tracking-wider pt-1 hover:underline block mx-auto flex items-center gap-1 justify-center"
                      >
                        {isRequestingPairing ? <RefreshCw className="w-3 h-3 animate-spin" /> : '🔄 Request New PIN'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 text-center">
                      <div className="p-3 bg-indigo-50/55 rounded-2xl border border-indigo-100/30">
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Target Phone</span>
                        <p className="text-sm font-mono font-black text-slate-750">{clientPhoneInput || pairingInputPhone || "Not Set"}</p>
                      </div>

                      <button
                        onClick={handleReqPairingCodeOnly}
                        disabled={isRequestingPairing}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isRequestingPairing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : '🔗 Request Pairing PinKey'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="text-[10px] text-slate-400 leading-normal text-center px-4">
                Open WhatsApp &gt; Linked Devices &gt; Link with phone number instead, type code.
              </div>
            </div>

          </div>
          )}

          {/* User friendly troubleshooting notes */}
          {pairingError && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center">
              <p className="text-[11px] font-bold text-rose-500">{pairingError}</p>
            </div>
          )}

          {/* Secured branding footer */}
          <div className="text-center text-slate-450 select-none pt-4 border-t border-slate-200/50">
            <p className="text-[9px] font-black tracking-widest uppercase text-slate-400">🛡️ SECURED DEVICE PORTAL GATEWAY • DANSCOM LABS</p>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDERING PAY HERO GATEWAY SIMULATOR PAGE ---
  if (isSimulator) {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoice_id') || 'sim_invoice_123';
    const amount = params.get('amount') || '5';
    const phone = params.get('phone') || '';
    const terminalId = params.get('terminal') || '';

    const handleConfirmSimulate = () => {
      const termParam = terminalId ? `&terminal=${terminalId}` : '';
      window.location.href = `/?invoice_id=${invoiceId}${termParam}`;
    };

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-8 text-center shadow-2xl">
          <div className="flex items-center justify-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Pay Hero Checkout Simulator</span>
          </div>
          
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider leading-none">Automated Token Amount</p>
            <p className="text-4xl font-black text-white mt-1">KES {amount}.00</p>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 p-5 rounded-3xl text-left space-y-3">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-500">Invoice Ref</span>
              <span className="font-mono text-slate-300">{invoiceId}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-500">Gateway Channel</span>
              <span className="text-emerald-400">🟢 Automated M-Pesa STK</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-500">Sender JID</span>
              <span className="font-mono text-slate-300">{phone}</span>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={handleConfirmSimulate}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-900/30"
            >
              Simulate M-Pesa Code Verification
            </button>
            <button 
              onClick={() => {
                const termParam = terminalId ? `?terminal=${terminalId}` : '';
                window.location.href = `/${termParam}`;
              }}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold uppercase tracking-widest rounded-2xl transition-all"
            >
              Decline Payment
            </button>
          </div>

          <p className="text-[9px] text-slate-600 leading-tight">
            Pay Hero multi-tenant microfinance simulation. This processes custom sandboxed parameters without accessing live bank API accounts.
          </p>
        </div>
      </div>
    );
  }

  // --- RENDERING ISOLATED MINI-DASHBOARD PAGE ---
  if (activeTerminalId) {
    if (!terminalData) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
          <Bot className="w-10 h-10 text-emerald-500 animate-bounce mb-3" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Querying active terminal channel...</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans flex flex-col justify-start">
        {/* Isolated header so users "gets pairing codes and qr codes without having the original dashboard" */}
        <nav className="h-20 bg-white border-b border-slate-200/60 flex items-center justify-between px-8 md:px-12 select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black">
              🎛️
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-800 uppercase leading-none">
                {terminalData.name}
              </h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                OPERATOR: {terminalData.operatorName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100/50 rounded-full">
            <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">SECURE BOT TERMINAL</span>
          </div>
        </nav>

        <div className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left panel: Deploy widget */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* INTERACTIVE TERMINAL USER MANUAL / CHRONICLE */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[2rem] text-white p-6 md:p-8 space-y-6 shadow-2xl select-none relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
              
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-500/25 rounded-lg border border-indigo-500/20 text-indigo-300">💡</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-indigo-100">Terminal Operators Quick-Start Guide</h3>
              </div>

              <div className="space-y-4 relative z-10">
                <p className="text-[11px] text-slate-300 font-semibold leading-relaxed">
                  Welcome to the multi-tenant secure terminal deployment widget. Follow these simple steps to link and activate your automated bot:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 rounded-full text-[10px] font-black flex items-center justify-center">1</span>
                      <h4 className="text-[10px] font-black uppercase tracking-wide text-indigo-300">Identify</h4>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Type your <strong>lowercase Bot Key ID</strong> &amp; <strong>WhatsApp Phone JID</strong> to secure your dedicated runtime database thread.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 rounded-full text-[10px] font-black flex items-center justify-center">2</span>
                      <h4 className="text-[10px] font-black uppercase tracking-wide text-indigo-300">Link Device First</h4>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Pair your WhatsApp <strong>FIRST</strong>! Scan the generated QR Code or request an 8-character numeric Pairing PIN.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 rounded-full text-[10px] font-black flex items-center justify-center">3</span>
                      <h4 className="text-[10px] font-black uppercase tracking-wide text-indigo-300">Pay subscription</h4>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Once connected successfully, the secure automated Pay Hero / M-Pesa checkout activates to authorize all prefix bot processes &amp; commands.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 rounded-full text-[10px] font-black flex items-center justify-center">4</span>
                      <h4 className="text-[10px] font-black uppercase tracking-wide text-indigo-300">Operator Live</h4>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Your bot goes live instantly! Send <code>.checksub</code> on WhatsApp to verify billing dates directly in real-time.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* DEPLOY BOT INSTANCE WIDGET PANEL */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200/50 shadow-xl p-8 md:p-10 space-y-8">
              <div>
                <span className="text-[9px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded font-black tracking-widest uppercase mb-3 inline-block">DEPLOY BOT INSTANCE</span>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Step 1: Setup Bot Credentials</h2>
                <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                  Enter your unique local identifier keys to open secure WhatsApp multi-device streams.
                </p>
              </div>

              {/* Verification Status Banner */}
              {terminalVerificationStatus === 'verifying' && (
                <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl text-center space-y-1 select-none animate-pulse">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">🔄 CALLING PAY HERO GATEWAY...</p>
                  <p className="text-[10px] text-slate-400 font-medium">Authenticating credentials and checking transaction status.</p>
                </div>
              )}
              {terminalVerificationStatus === 'success' && (
                <div className="bg-emerald-50 border border-emerald-200/40 p-5 rounded-3xl text-center space-y-1 select-none">
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">✅ SUBSCRIPTION AUTHORIZED SUCCESSFUL</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Setup clearance verified. Your live WhatsApp bot processes are active!</p>
                </div>
              )}
              {terminalVerificationStatus === 'failed' && (
                <div className="bg-rose-55 border border-rose-200/40 p-5 rounded-3xl text-center space-y-1 select-none">
                  <p className="text-xs font-black text-rose-700 uppercase tracking-widest">❌ TRANSACTION EXPIRED OR INVALID</p>
                  <p className="text-[10px] text-rose-500 font-medium">Could not verify checkout status instantly via Pay Hero. Please try again.</p>
                </div>
              )}

              {/* Step 1 input fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Bot Key Identifier (lowercase)</label>
                      <button
                        type="button"
                        onClick={() => setTerminalBotId(`bot_${Math.floor(1000 + Math.random() * 9000)}`)}
                        className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-wider cursor-pointer bg-transparent border-none p-0"
                      >
                        🎲 Generate Unique Key
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="e.g. mpesa_bot"
                      value={terminalBotId}
                      onChange={(e) => setTerminalBotId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 font-sans">WhatsApp JID/Mobile Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 254712345678"
                      value={terminalPhone}
                      onChange={(e) => setTerminalPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-150/70 rounded-2xl">
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                    💡 <strong className="text-slate-700">Connect Multiple Numbers:</strong> You can link several WhatsApp numbers to this same terminal! Simply supply a different, unique <strong>Bot Key Identifier</strong> (like <code className="font-mono text-emerald-600 font-bold">bot_alice</code> or <code className="font-mono text-emerald-600 font-bold">bot_bob</code>) for each device. Even the same phone number can be set up as multiple separate connection instances!
                  </p>
                </div>
              </div>

              {/* Dynamic inline render of Step 2 and Step 3 */}
              {(() => {
                const activeSessState = sessions.find(s => s.sessionId === terminalBotId);
                const isSessConnected = activeSessState?.connected || false;

                if (!terminalBotId || !terminalPhone) {
                  return (
                    <div className="p-6 bg-amber-500/5 border border-dashed border-amber-200 rounded-3xl text-center select-none">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">⚠️ Credentials Required</p>
                      <p className="text-[9px] text-slate-400 mt-1 max-w-sm mx-auto font-medium">
                        Please specify both a custom Bot Identifier and your WhatsApp Phone Number above to proceed with device pairing.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-8 pt-4 border-t border-slate-150">
                    {/* STEP 2: PAIRING SECTION */}
                    <div className="space-y-4">
                      <div>
                        <span className="text-[9px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-black tracking-wider uppercase inline-block">STEP 2</span>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mt-1">Connect Your Device First</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Choose either connection method below to securely link your WhatsApp account.</p>
                      </div>

                      {isSessConnected ? (
                        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl space-y-2 text-center select-none">
                          <span className="text-2xl">🎉</span>
                          <p className="text-xs font-black text-emerald-850 uppercase tracking-widest mt-1">WHATSAPP ACCOUNT LINKED SUCCESSFULLY</p>
                          <p className="text-[10px] text-emerald-600 font-semibold leading-normal">Your WhatsApp session is live and actively listening for chat commands.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          
                          {/* METHOD A: SCAN QR CODE */}
                          <div className="p-5 bg-slate-50 border border-slate-200/70 rounded-3xl space-y-4 flex flex-col justify-between text-center">
                            <div className="space-y-1">
                              <span className="text-[8px] bg-slate-900 text-white px-2 py-0.5 rounded font-black uppercase">METHOD A</span>
                              <h4 className="text-xs font-black text-slate-850 uppercase mt-1">Scan QR Code</h4>
                              <p className="text-[10px] text-slate-400 font-medium">Generates a live QR streaming code</p>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-slate-100">
                              {activeSessState?.qr ? (
                                <div className="p-2 border border-slate-50 bg-white rounded-xl shadow-sm">
                                  <QRCodeSVG value={activeSessState.qr} size={135} />
                                  <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-wider mt-2.5 animate-pulse">Auto-refreshes</p>
                                </div>
                              ) : (
                                <div className="py-8 space-y-3">
                                  <QrCode className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
                                  <button
                                    onClick={handleTerminalActivateQRStream}
                                    disabled={isTerminalQRInitializing}
                                    className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-[9px] font-black uppercase text-white tracking-widest rounded-lg transition-all shadow-sm"
                                  >
                                    {isTerminalQRInitializing ? 'Init...' : '🔌 Show QR Code'}
                                  </button>
                                </div>
                              )}
                            </div>

                            <p className="text-[9px] text-slate-400">Open WhatsApp &gt; Link Device &gt; Scan QR.</p>
                          </div>

                          {/* METHOD B: REQUEST PIN CODE */}
                          <div className="p-5 bg-slate-50 border border-slate-200/70 rounded-3xl space-y-4 flex flex-col justify-between text-center">
                            <div className="space-y-1">
                              <span className="text-[8px] bg-slate-900 text-white px-2 py-0.5 rounded font-black uppercase">METHOD B</span>
                              <h4 className="text-xs font-black text-slate-850 uppercase mt-1">Numeric Pin</h4>
                              <p className="text-[10px] text-slate-400 font-medium font-sans">Pairs with an 8-character token</p>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-100">
                              {activeSessState?.pairingCode || terminalActiveSession?.pairingCode ? (
                                <div className="space-y-2">
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block leading-none">Your Pairing PIN</label>
                                  <p className="text-2xl font-mono tracking-widest font-black text-indigo-600 select-all">
                                    {activeSessState?.pairingCode || terminalActiveSession?.pairingCode}
                                  </p>
                                  <p className="text-[8px] text-slate-400 leading-normal px-2">Type this numeric code on your phone when prompted.</p>
                                </div>
                              ) : (
                                <div className="py-8 space-y-3">
                                  <Smartphone className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
                                  <button
                                    onClick={handleTerminalRequestPairingCode}
                                    disabled={isRequestingPairing}
                                    className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-[9px] font-black uppercase text-white tracking-widest rounded-lg transition-all shadow-sm"
                                  >
                                    {isRequestingPairing ? 'Generating...' : '🔗 Request PIN'}
                                  </button>
                                </div>
                              )}
                            </div>

                            <p className="text-[9px] text-slate-400 font-sans">Link with phone number instead &gt; type token.</p>
                          </div>

                        </div>
                      )}
                    </div>

                    {/* STEP 3: PAYMENT & ACTIVATION SECTION */}
                    <div className="pt-6 border-t border-slate-150 space-y-4">
                      <div>
                        <span className="text-[9px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-black tracking-wider uppercase inline-block">STEP 3</span>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mt-1">Pay & Activate Bot</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Verify Setup and Automated Subscriptions to active prefix commands.</p>
                      </div>

                      {terminalVerificationStatus === 'success' ? (
                        <div className="p-5 bg-emerald-500/10 border border-emerald-200 rounded-3xl select-none flex items-center justify-center gap-3">
                          <Check className="w-5 h-5 text-emerald-650" />
                          <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wide">ACTIVE: Setup & Subscription Verified Cleared via Pay Hero</span>
                        </div>
                      ) : isSessConnected ? (
                        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200/60 flex flex-col gap-4 animate-fade-in shadow-sm">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-slate-400 uppercase tracking-wider">Downpayment (First Time Setup)</span>
                            <span className="text-slate-800 font-bold">KES {terminalData.setupFee}.00</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-slate-400 uppercase tracking-wider font-sans">Automated Subscription Renewal</span>
                            <span className="text-indigo-600 font-bold">KES {terminalData.weeklyRate}.00 / week</span>
                          </div>

                          <button 
                            onClick={handleTerminalCreateCheckout}
                            disabled={terminalPaymentPending}
                            className="w-full mt-2 py-4 bg-slate-900 hover:bg-slate-850 active:scale-[0.99] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {terminalPaymentPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                            {terminalPaymentPending ? '🔄 Contacting Pay Hero Gateway...' : '🔒 Complete Authorized Pay via Pay Hero'}
                          </button>
                        </div>
                      ) : (
                        <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-center select-none text-slate-400 space-y-1">
                          <CreditCard className="w-6 h-6 text-slate-300 mx-auto" />
                          <p className="text-[10px] font-bold uppercase tracking-wide">⏳ STEP 2 Link Required</p>
                          <p className="text-[9px] font-semibold">Please connect your WhatsApp device under Step 2 above first. The Checkout Portal activates automatically once linked successfully.</p>
                        </div>
                      )}
                    </div>

                    {pairingError && (
                      <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center">
                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-wide leading-relaxed">{pairingError}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>

          {/* Right panel: connected bots summary list */}
          <div className="lg:col-span-5 bg-white rounded-[2.5rem] border border-slate-200/50 shadow-md p-8 md:p-10 space-y-6">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 select-none">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Connected Bots (This Terminal)
            </h3>

            {/* Share Portal Link to Connect Other Bots */}
            <div className="p-5 bg-indigo-50/55 border border-indigo-100 rounded-[1.5rem] space-y-3 shadow-none">
              <div className="flex items-center gap-2 select-none">
                <LinkIcon className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Invite & Connect Other Bots</h4>
              </div>
              <p className="text-[10px] text-indigo-500 font-semibold leading-relaxed">
                Need other operators to link their bots under this terminal? Share this portal link to let them pay and deploy instantly!
              </p>
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}?terminal=${activeTerminalId}`;
                  navigator.clipboard.writeText(shareUrl);
                  alert('Direct connection portal link for other bots copied to clipboard!');
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Connection Link
              </button>
            </div>

            {(() => {
              const activeTerminalSessions = sessions.filter(s => s.terminalId === activeTerminalId);
              if (activeTerminalSessions.length === 0) {
                return (
                  <div className="text-center py-10">
                    <Bot className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-[10px] text-slate-400 font-bold uppercase">No Bots Connected to this Terminal</p>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  {activeTerminalSessions.map(s => {
                    const targetTermId = s.terminalId || activeTerminalId || 'main_terminal';
                    const directPairingUrl = `${window.location.origin}?terminal=${targetTermId}&pairing_view=true&session=${s.sessionId}`;
                    return (
                      <div key={s.sessionId} className="p-5 bg-slate-50 border border-slate-200/50 rounded-[1.5rem] flex flex-col gap-4 shadow-sm hover:border-slate-300 transition-all">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-black text-slate-850 uppercase leading-none">{s.sessionId}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${s.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                                {s.connected ? '🟢 Linked Live' : '⚙️ Pending'}
                              </span>
                            </div>
                          </div>
                          <span className={`w-2.5 h-2.5 rounded-full ${s.connected ? 'bg-emerald-500 shadow-sm shadow-emerald-250' : 'bg-amber-400'}`} />
                        </div>
                        
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setPairingViewSessionId(s.sessionId);
                              setIsPairingViewOnly(true);
                            }}
                            className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-slate-800 transition-all text-center flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" /> Open Pairing Link
                          </button>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(directPairingUrl);
                              alert('Direct, secure pairing link containing QR & PIN code methods copied to clipboard!');
                            }}
                            className="px-3 py-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                            title="Copy Standalone Pairing Link (QR & PIN only)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="border-t border-slate-100 pt-5 space-y-3">
              <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase text-center select-none">Join Official Community</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href="https://whatsapp.com/channel/0029Vb7cIiCFcow5xMvqxs2H"
                  target="_blank"
                  rel="noreferrer noopener"
                  id="visitor-channel-btn"
                  className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 text-indigo-700 rounded-xl text-[10px] font-black uppercase text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  📢 Join Channel
                </a>
                <a
                  href="https://chat.whatsapp.com/Fn2XuWVDZPmCypETN9WCC1?mode=gi_t"
                  target="_blank"
                  rel="noreferrer noopener"
                  id="visitor-group-btn"
                  className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 text-emerald-700 rounded-xl text-[10px] font-black uppercase text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  💬 Support Group
                </a>
              </div>
            </div>
            
            <div className="pt-6 border-t border-slate-100 text-center select-none">
              <span className="text-[9px] text-slate-400 font-black tracking-widest uppercase">🛡️ INTASEND ENCRYPTED DEPLOYMENT</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDERING MAIN DASHBOARD (OWNER / CREATOR PLATFORM) ---
  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Top Banner Status */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs">
            📟
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight uppercase text-slate-800">DANSCOM MULTI-TENANT GATEWAY</h1>
            <p className="font-mono text-[9px] text-slate-400 font-bold leading-none uppercase tracking-wider mt-0.5">OWNER ADMIN CONSOLE</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.includes('Online') ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span className="text-xs font-bold text-slate-500 uppercase">{status}</span>
          </div>
        </div>
      </header>

      {/* Pairing Code Overlay Modal */}
      <AnimatePresence>
        {showPairing && (() => {
          const activeSessState = sessions.find(s => s.sessionId === pairingSessionId);
          return (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl max-w-lg w-full p-8 md:p-10 space-y-6 relative"
              >
                <button 
                  onClick={() => setShowPairing(false)}
                  className="absolute right-6 top-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                    <QrCode className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Connect Bot Device</h3>
                  <p className="text-xs text-slate-400">Generate pairing codes for {pairingSessionId} session instantly</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">WhatsApp Phone Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 254712345678"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                    />
                  </div>

                  <button 
                    onClick={handleRequestPairingCode}
                    disabled={isRequestingPairing || !phoneNumber}
                    className="w-full py-4 bg-slate-900 border border-slate-950 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRequestingPairing ? <RefreshCw className="w-4 h-4 animate-spin" /> : '🔗 Generate Pairing Code'}
                  </button>

                  {pairingError && (
                    <p className="text-xs text-rose-500 font-bold text-center bg-rose-50 p-3 rounded-xl border border-rose-100">{pairingError}</p>
                  )}

                  {activeSessState?.pairingCode && (
                    <div className="text-center p-6 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner space-y-2 animate-bounce">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Linked Device pairing Token</label>
                      <p className="text-4xl font-mono tracking-widest font-black text-indigo-600">{activeSessState.pairingCode}</p>
                      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">Enter this code on your WhatsApp mobile Linked Devices screen.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 flex-shrink-0 overflow-y-auto">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4 select-none">Core Systems</p>
            <ul className="space-y-1">
              <li 
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-3 text-sm font-bold p-2.5 rounded-xl border transition-all cursor-pointer select-none ${activeTab === 'dashboard' ? 'text-emerald-600 bg-emerald-50 border-emerald-100/50' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </li>
              <li 
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-3 text-sm font-medium p-2.5 rounded-xl border transition-all cursor-pointer group/li select-none ${activeTab === 'ai' ? 'text-emerald-600 bg-emerald-50 border-emerald-100/50' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}
              >
                <Zap className="w-4 h-4 transition-transform group-hover/li:scale-110" />
                AI Integrations
                <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover/li:opacity-100 transition-opacity" />
              </li>
              <li 
                onClick={() => setActiveTab('plugins')}
                className={`flex items-center gap-3 text-sm font-medium p-2.5 rounded-xl border transition-all cursor-pointer group/li select-none ${activeTab === 'plugins' ? 'text-emerald-600 bg-emerald-50 border-emerald-100/50' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}
              >
                <Puzzle className="w-4 h-4 transition-transform group-hover/li:scale-110" />
                Plugin Manager
              </li>
              <li 
                onClick={() => setActiveTab('console')}
                className={`flex items-center gap-3 text-sm font-medium p-2.5 rounded-xl border transition-all cursor-pointer group/li select-none ${activeTab === 'console' ? 'text-emerald-600 bg-emerald-50 border-emerald-100/50' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}
              >
                <Terminal className="w-4 h-4 transition-transform group-hover/li:scale-110" />
                Log Console
              </li>
              <li 
                onClick={() => {
                  setPairingSessionId('default_bot');
                  setShowPairing(true);
                }}
                className="flex items-center gap-3 text-sm font-medium text-slate-500 hover:text-emerald-600 hover:bg-slate-50 transition-all cursor-pointer p-2.5 rounded-xl group/li mt-4 bg-slate-50/50 border border-slate-100 select-none"
              >
                <QrCode className="w-4 h-4 transition-transform group-hover/li:scale-110" />
                Connect Bot
                {connection.connected && <div className="ml-auto w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>}
              </li>
              <li 
                onClick={() => setActiveTab('sessions')}
                className={`flex items-center gap-3 text-sm font-medium p-2.5 rounded-xl border transition-all cursor-pointer group/li select-none ${activeTab === 'sessions' ? 'text-emerald-600 bg-emerald-50 border-emerald-100/50' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}
              >
                <Users className="w-4 h-4 transition-transform group-hover/li:scale-110" />
                Active Sessions
              </li>
              <li 
                onClick={() => setActiveTab('transactions')}
                className={`flex items-center gap-3 text-sm font-medium p-2.5 rounded-xl border transition-all cursor-pointer group/li select-none ${activeTab === 'transactions' ? 'text-emerald-600 bg-emerald-50 border-emerald-100/50' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}
              >
                <CreditCard className="w-4 h-4 transition-transform group-hover/li:scale-110" />
                Payment Logs
              </li>
            </ul>
          </div>
          
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4 select-none">Financials</p>
            <div className="bg-slate-900 rounded-2xl p-4 text-white relative overflow-hidden group select-none">
              <p className="text-[9px] uppercase font-bold opacity-50 tracking-wider font-sans">Automated Weekly Revenue</p>
              <p className="text-xl font-black mt-1.5 tabular-nums">KES 12,850.00</p>
              <div className="flex items-center gap-2 mt-3 overflow-hidden">
                <span className="text-[9px] bg-white/10 rounded px-2 py-1 font-bold whitespace-nowrap">285 Terminals Active</span>
              </div>
              <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-emerald-500 opacity-20 rounded-full blur-xl group-hover:scale-150 transition-transform" />
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-100 select-none space-y-4">
            <div className="space-y-2">
              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Gateway Community</p>
              <div className="flex flex-col gap-1.5">
                <a
                  href="https://whatsapp.com/channel/0029Vb7cIiCFcow5xMvqxs2H"
                  target="_blank"
                  rel="noreferrer noopener"
                  id="community-channel-btn"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-100 rounded-xl transition-all text-xs font-bold text-indigo-700 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">📢 Official Channel</span>
                  <ChevronRight className="w-3 h-3 text-indigo-400" />
                </a>
                <a
                  href="https://chat.whatsapp.com/Fn2XuWVDZPmCypETN9WCC1?mode=gi_t"
                  target="_blank"
                  rel="noreferrer noopener"
                  id="community-group-btn"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-100 rounded-xl transition-all text-xs font-bold text-emerald-700 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">💬 Support Group</span>
                  <ChevronRight className="w-3 h-3 text-emerald-400" />
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-2xl bg-slate-50 shadow-inner animate-pulse">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Database</p>
                <div className="flex items-center gap-1.5 font-mono">
                  <Database className="w-3 h-3 text-slate-400" />
                  <p className="text-[11px] font-bold text-slate-700">Firebase Ready</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-8">
          {activeTab === 'dashboard' ? (
            <>
              {/* DATABASE STORAGE STATE WARNING */}
              {dbStatus && !dbStatus.isFirestoreUsable && (
                <div className="bg-amber-50/75 border border-amber-200/50 rounded-[2rem] p-6 flex flex-col md:flex-row items-start gap-4 shadow-sm select-none">
                  <div className="p-3 bg-amber-100/80 rounded-2xl text-amber-600 self-start md:self-center">
                    <Database className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider leading-none">Firestore Storage Offline</h4>
                    <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                      Using in-memory safe backup fallbacks to secure maximum database up-time. Add credentials to write permanently.
                    </p>
                  </div>
                </div>
              )}

              {/* Bot status panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 select-none">
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Connected Bots</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">{sessions.filter(s => s.connected).length}</p>
                </div>
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Aggregate Command Load</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">{stats.totalCommands}</p>
                </div>
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Subscriber JIDs</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">{stats.activeUsers}</p>
                </div>
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 col-span-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">System Latency</p>
                  <p className="text-3xl font-black text-emerald-500 mt-1">{stats.latency} ms</p>
                </div>
              </div>

              {/* Connected bot state list displays all terminals bots automatically! */}
              <div className="bg-white border border-slate-150/70 rounded-[2.5rem] p-8 space-y-6 shadow-sm">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">System Deployments Network</h3>
                  <p className="text-xs text-slate-400 font-medium">Both main and downstream terminal bots are rendered perfectly below</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase">
                        <th className="py-3 px-2">Session Name</th>
                        <th className="py-3 px-2">Connected State</th>
                        <th className="py-3 px-2">Active Pairing Token</th>
                        <th className="py-3 px-2">Linked Terminal ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                      {sessions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400 italic">No deployed bot keys inside workspace</td>
                        </tr>
                      ) : (
                        sessions.map(s => (
                          <tr key={s.sessionId} className="hover:bg-slate-50/55 transition-colors">
                            <td className="py-3.5 px-2 font-black uppercase text-slate-800">{s.sessionId}</td>
                            <td className="py-3.5 px-2">
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${s.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                                {s.connected ? '🟢 Linked Live' : '⚙️ Pairing Pending'}
                              </span>
                            </td>
                            <td className="py-3.5 px-2 font-mono text-indigo-600 font-bold">{s.pairingCode || 'None'}</td>
                            <td className="py-3.5 px-2 font-black text-slate-500 uppercase">{s.terminalId || 'Unlinked (Main Bot)'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : activeTab === 'ai' ? (
            <div className="flex-1 space-y-8">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">AI & Gemini Engine Control</h2>
                <p className="text-xs text-slate-400">Manage deep natural-language intelligence prompts and instructions</p>
              </div>

              {aiConfig ? (
                <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm p-8 space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Primary Gemini AI Model</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={aiConfig.model} 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-sm font-bold font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Bot Context & Behavior Directives</label>
                    <textarea 
                      readOnly
                      rows={5}
                      value={aiConfig.systemInstruction} 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-4 text-xs font-semibold leading-relaxed text-slate-600 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-400 text-xs">Loading AI settings config...</div>
              )}
            </div>
          ) : activeTab === 'plugins' ? (
            <div className="flex-1 space-y-12">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Plugin Manager</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Manage automated background capabilities and modules</p>
                </div>
              </div>

              {/* Plugins Grid Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plugins.map((plugin, i) => (
                  <div key={plugin.name || i} className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 space-y-3 relative group">
                    <div className="flex justify-between items-start">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <Puzzle className="w-5 h-5 text-slate-700" />
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[8px] font-bold uppercase tracking-wider">Active</span>
                    </div>

                    <div>
                      <h4 className="text-sm font-black uppercase text-slate-800">{plugin.name || 'Capabilities'}</h4>
                      <p className="text-xs text-slate-400 mt-1 select-none leading-relaxed">Automated trigger hooks with full command support.</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* TERMINAL CREATION & MANAGEMENT CONTROL PANEL (Owner panel requested by user) */}
              <div className="bg-white border border-slate-150/80 rounded-[2.5rem] shadow-xl p-8 md:p-10 space-y-8">
                <div>
                  <span className="text-[9px] bg-slate-900 text-white px-3 py-1 rounded font-black tracking-widest uppercase mb-3 inline-block">TERMINALS MANAGEMENT SYSTEM</span>
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Terminal Multi-Tenant Network Setup</h2>
                  <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
                    Create independent user portals. Each portal can deploy and pay for their own bots using IntaSend checkouts, keeping JID sessions sandboxed and distinct.
                  </p>
                </div>

                {/* Form to Create New Terminals */}
                <div className="bg-slate-50 p-6 md:p-8 rounded-[2rem] border border-slate-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Terminal ID / Key</label>
                    <input 
                      type="text" 
                      placeholder="e.g. nairobi_port"
                      value={newTerminalId}
                      onChange={(e) => setNewTerminalId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Terminal Display Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Kenya Central Bot"
                      value={newTerminalName}
                      onChange={(e) => setNewTerminalName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Operator Manager name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Daniel Musembi"
                      value={newTerminalOperator}
                      onChange={(e) => setNewTerminalOperator(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-semibold focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">weekly KES</label>
                      <input 
                        type="number" 
                        value={newTerminalWeeklyRate}
                        onChange={(e) => setNewTerminalWeeklyRate(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-3 text-xs font-bold focus:outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">setup KES</label>
                      <input 
                        type="number" 
                        value={newTerminalSetupFee}
                        onChange={(e) => setNewTerminalSetupFee(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-3 text-xs font-bold focus:outline-none text-center"
                      />
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleCreateTerminal}
                    className="py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-md select-none flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Create Terminal
                  </button>
                </div>

                {/* List of current terminals + action buttons */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Terminals Network Inventory</h4>
                  
                  {terminals.length === 0 ? (
                    <div className="py-8 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-center italic text-slate-400 text-xs">
                      No active terminals created. Fill form parameters above to create your first tenant link.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {terminals.map(term => {
                        const directUrl = `${window.location.origin}?terminal=${term.id}`;
                        const botsInTerm = sessions.filter(s => s.terminalId === term.id);

                        return (
                          <div key={term.id} className="p-6 bg-slate-50/60 border border-slate-200/50 rounded-[2rem] space-y-4 shadow-sm hover:shadow-md transition-shadow relative">
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="text-sm font-black text-slate-800 uppercase leading-none">{term.name}</h5>
                                <p className="text-[8px] font-black tracking-wider text-slate-400 uppercase mt-1">ID: {term.id} • Operator: {term.operatorName || 'System'}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[8px] font-bold uppercase tracking-wider">Multi-Tenant</span>
                            </div>

                            <div className="flex justify-between items-center text-[11px] bg-white p-3 rounded-xl border border-slate-100">
                              <span className="font-bold text-slate-400 uppercase">Pricing Configuration</span>
                              <span className="font-bold text-slate-800">Setup: {term.setupFee} KES • Weekly: {term.weeklyRate} KES</span>
                            </div>

                            <div className="flex justify-between items-center text-[10px] bg-white p-3 rounded-xl border border-slate-100">
                              <span className="font-bold text-slate-400 uppercase">Connected Bots Inventory</span>
                              <span className="font-mono text-indigo-600 font-bold">{botsInTerm.length} connected</span>
                            </div>

                            {/* Share portal URL handles copying link */}
                            <div className="flex items-center gap-2 pt-2">
                              <button 
                                onClick={() => copyTerminalLink(term.id)}
                                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
                              >
                                {copiedId === term.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                    Copy Portal Link
                                  </>
                                )}
                              </button>
                              
                              <a 
                                href={directUrl} 
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2.5 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all hover:bg-slate-800 text-center"
                              >
                                Open Portal
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'transactions' ? (
            <div className="flex-1 space-y-8">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Financial Transactions</h2>
                <p className="text-xs text-slate-400">Verifying real-time tenant payments, setup keys, and automated collections history</p>
              </div>

              {/* Transactions grid/list */}
              <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-3 select-none border-b border-slate-100 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Transaction Records ({transactions.length})</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      dbStatus?.payheroMode === 'live' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100/60' 
                        : 'bg-amber-50 text-amber-700 border-amber-100/60'
                    }`}>
                      {dbStatus?.payheroMode === 'live' ? '● Real Money Live Mode' : '○ Sandbox Testing Mode'}
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-auto">
                    💰 Powered by Pay Hero Ke
                  </span>
                </div>

                {transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <CreditCard className="w-10 h-10 text-slate-205 mx-auto mb-2" />
                    <p className="text-[11px] text-slate-400 font-black uppercase">No transactions logs recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[40rem] overflow-y-auto pr-2">
                    {transactions.map(tx => {
                      const displayId = tx.id;
                      const displayInvoice = tx.intasendInvoiceId || 'N/A';
                      const txDate = new Date(tx.createdAt).toLocaleString();
                      
                      return (
                        <div key={tx.id} id={`tx-${tx.id}`} className="p-5 bg-slate-50 border border-slate-200/50 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                tx.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                tx.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {tx.status}
                              </span>
                              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                                {tx.type}
                              </span>
                            </div>
                            <h4 className="text-xs font-black text-slate-850 uppercase">
                              KES {tx.amount}.00 • {tx.phoneNumber}
                            </h4>
                            <p className="text-[10px] font-mono font-semibold text-slate-500">
                              BOT: {tx.sessionId} • TERM: {tx.terminalId || 'Unlinked'} • {txDate}
                            </p>
                            <div className="text-[9px] font-mono text-slate-400 space-y-0.5">
                              <p>REF ID: {displayId}</p>
                              {tx.payheroReference && <p>PAY HERO REF: {tx.payheroReference}</p>}
                              {tx.intasendInvoiceId && <p>INTASEND INVOICE: {tx.intasendInvoiceId}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(displayId);
                                alert(`Copied checkout reference ID: ${displayId}`);
                              }}
                              className="py-2 px-3 bg-white border border-slate-200 hover:text-slate-850 hover:bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                              title="Copy checkout/transaction Ref ID"
                              id={`copy-id-${tx.id}`}
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" /> Copy ID
                            </button>
                            {(tx.payheroReference || tx.intasendInvoiceId) && (
                              <button 
                                onClick={() => {
                                  const cRef = tx.payheroReference || tx.intasendInvoiceId;
                                  navigator.clipboard.writeText(cRef);
                                  alert(`Copied Pay Hero reference: ${cRef}`);
                                }}
                                className="py-2 px-3 bg-white border border-slate-200 hover:text-slate-850 hover:bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                                title="Copy Pay Hero reference"
                                id={`copy-invoice-${tx.id}`}
                              >
                                <Copy className="w-3.5 h-3.5 text-slate-400" /> Copy Ref ID
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'console' ? (
            <div className="flex-1 flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Log Console Stream</h2>
                <p className="text-xs text-slate-400">Verifying real-time background automation process logs</p>
              </div>

              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-[2.5rem] p-6 font-mono text-slate-200 text-xs shadow-2xl h-[35rem] overflow-y-auto space-y-2 select-text">
                <p className="text-slate-500 select-none">[System Bootstrap Server running successfully on PORT: 3000]</p>
                <p className="text-slate-400 select-none">[Pay Hero multi-tenant microfinance listener initiated]</p>
                <p className="text-slate-400 select-none">[Firestore dynamic state machine successfully configured]</p>
                <p className="text-emerald-400 font-bold">[Active bot listener running. Ready to receive commands]</p>
              </div>
            </div>
          ) : (
            /* Tab === sessions */
            <div className="flex-1 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Active Sessions Admin</h2>
                  <p className="text-xs text-slate-400">Manage, isolate or prune multi-tenant sub-account bots</p>
                </div>
              </div>

              {/* Create new main/owner session field */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 flex flex-col md:flex-row gap-4 items-center">
                <input 
                  type="text" 
                  placeholder="Insert custom Session ID key"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full md:flex-1 bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-bold focus:outline-none"
                />
                
                <button 
                  onClick={handleCreateSession}
                  className="w-full md:w-auto py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-md select-none leading-none block"
                >
                  Start New Session ID
                </button>
              </div>

              {/* Table list of sessions with deletion capabilities */}
              <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm p-8">
                <div className="space-y-4">
                  {sessions.map(sess => (
                    <div key={sess.sessionId} className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase">{sess.sessionId}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Terminal key association: {sess.terminalId || 'Unlinked (Master)'}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setPairingViewSessionId(sess.sessionId);
                            setIsPairingViewOnly(true);
                          }}
                          className="py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                        >
                          Pairing Console
                        </button>
                        <button 
                          onClick={() => {
                            const termId = sess.terminalId || 'main_terminal';
                            const directPairingUrl = `${window.location.origin}?terminal=${termId}&pairing_view=true&session=${sess.sessionId}`;
                            navigator.clipboard.writeText(directPairingUrl);
                            alert('Copied secure standalone pairing link for this session!');
                          }}
                          className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition-all flex items-center justify-center shadow-sm"
                          title="Copy Standalone Pairing Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteSession(sess.sessionId)}
                          className="py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                        >
                          Prune bot JID
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
