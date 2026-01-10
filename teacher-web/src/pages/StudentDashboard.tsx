import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, orderBy, limit, doc, runTransaction, setDoc } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle, LogOut, ScanLine, Wifi, Zap, History, Calendar, Clock, MapPin, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getDistanceInMeters } from '../lib/geo'; // Import shared utility

interface Session {
    id: string;
    subject: string;
    classroomName: string;
    classroomLocation: { lat: number; lon: number; radius: number };
    currentQrCode: string;
    isActive: boolean;
    bleServiceUUID?: string;
    heartbeatNonce?: string;
}

interface AttendanceRecord {
    id: string;
    sessionId: string;
    sessionSubject: string;
    classroomName: string;
    status: string;
    timestamp: any;
}

export default function StudentDashboard() {
    const { user, deviceId, logout } = useAuth();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [scanning, setScanning] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [attendanceStatus, setAttendanceStatus] = useState<'NONE' | 'JOINING' | 'MARKED' | 'FAILED'>('NONE');
    const [msg, setMsg] = useState('');
    const [location, setLocation] = useState<{ lat: number, lon: number; accuracy?: number } | null>(null);
    const [autoJoinEnabled] = useState(true);
    const [manualId, setManualId] = useState('');

    const joinedSessionIdRef = useRef<string | null>(null);

    // Derived active session from real-time list
    const selectedSession = sessions.find(s => s.id === selectedSessionId) || null;

    // 1. Real-time Session Listener
    useEffect(() => {
        const q = query(collection(db, "sessions"), where("isActive", "==", true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Session[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as Session);
            });
            setSessions(list);
        });
        return () => unsubscribe();
    }, []);

    // 2. Attendance History Listener
    useEffect(() => {
        if (!user) return;
        const q = query(
            collection(db, "attendance"),
            where("studentId", "==", user.id),
            orderBy("timestamp", "desc"),
            limit(20)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: AttendanceRecord[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
            });
            setHistory(list);
        });
        return () => unsubscribe();
    }, [user]);

    // 2. Geolocation Tracker & Auto-Join Logic
    useEffect(() => {
        if (!navigator.geolocation) {
            setMsg("Geolocation not supported");
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                const newLoc = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                };
                setLocation(newLoc);

                // Check distance for selected session
                if (selectedSession) {
                    // Just triggering re-render if needed or kept for future
                }

                // AUTO-JOIN LOGIC
                if (autoJoinEnabled && attendanceStatus === 'NONE' && !joinedSessionIdRef.current) {
                    for (const s of sessions) {
                        const d = getDistanceInMeters(newLoc.lat, newLoc.lon, s.classroomLocation.lat, s.classroomLocation.lon);
                        // Join if distance <= radius check
                        if (d <= s.classroomLocation.radius + 15) {
                            console.log(`Auto-joining session: ${s.subject}`);
                            setSelectedSessionId(s.id);
                            // Auto-join implies CONNECTION, not Marking (marking needs QR)
                            // But we can try to joinSession() if we are close enough?
                            // For now, let's just select it. Join implies strict binding.
                            // If we auto-call joinSession, it might bind randomly. Prompt says "Student can ONLY join by Scanning QR or Manual UUID".
                            // So Auto-Join should probably just SELECT the session and prompt user to "Scan to Join".
                            break;
                            // Previously: called markAttendance. Now: Just Select.
                        }
                    }
                }
            },
            (err) => {
                console.error("GPS Error:", err);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [sessions, selectedSessionId, autoJoinEnabled, attendanceStatus]);

    const handleSelectSession = (s: Session) => {
        if (!location) { alert("Waiting for location..."); return; }
        const d = getDistanceInMeters(location.lat, location.lon, s.classroomLocation.lat, s.classroomLocation.lon);
        setSelectedSessionId(s.id);

        if (d <= s.classroomLocation.radius + 20) setMsg(`In Range (${Math.round(d)}m)`);
        else setMsg(`Too Far (${Math.round(d)}m)`);

        if (joinedSessionIdRef.current !== s.id) {
            setAttendanceStatus('NONE');
        }
    };

    const startScanner = (session?: Session) => {
        if (session) {
            setSelectedSessionId(session.id);
        }
        setScanning(true);
        setMsg('Scan Teacher QR Code');
    };

    // QR Logic 
    useEffect(() => {
        let html5QrCode: Html5Qrcode | null = null;
        if (scanning) {
            const init = async () => {
                await new Promise(r => setTimeout(r, 100));
                if (!document.getElementById("reader")) return;
                html5QrCode = new Html5Qrcode("reader");
                html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
                    async (decodedText) => {
                        await html5QrCode?.stop();
                        html5QrCode?.clear();
                        setScanning(false);

                        // If we scanned a code, we need to find which session it matches
                        let targetSession = selectedSession;

                        // If no session selected, try to find by QR match
                        if (!targetSession) {
                            targetSession = sessions.find(s => s.currentQrCode === decodedText || s.bleServiceUUID === decodedText || s.id === decodedText) || null;
                        }

                        if (targetSession) {
                            const d = location ? getDistanceInMeters(location.lat, location.lon, targetSession.classroomLocation.lat, targetSession.classroomLocation.lon) : 99999;
                            await markAttendance(targetSession, decodedText, d);
                        } else {
                            setMsg("Invalid QR Code or Session not active.");
                        }
                    },
                    () => {
                        // parse error, ignore
                    }
                );
            };
            init();
        }
        return () => { if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop().then(() => html5QrCode?.clear()); }
    }, [scanning, sessions, selectedSession]);

    // HEARTBEAT LISTENER
    // Listen for changes in selectedSession.heartbeatNonce
    useEffect(() => {
        if (attendanceStatus === 'MARKED' && selectedSession?.heartbeatNonce && joinedSessionIdRef.current === selectedSession.id) {
            // Respond to heartbeat
            respondToHeartbeat(selectedSession.id, selectedSession.heartbeatNonce);
        }
    }, [selectedSession?.heartbeatNonce, attendanceStatus]);

    const respondToHeartbeat = async (sessionId: string, nonce: string) => {
        if (!user) return;
        try {
            const hbRef = doc(db, "sessions", sessionId, "heartbeats", user.id);
            await setDoc(hbRef, {
                studentId: user.id,
                nonce: nonce,
                timestamp: serverTimestamp(),
                location: location
            });
            console.log("Heartbeat ACK sent:", nonce);
        } catch (e) {
            console.error("Heartbeat ACK failed", e);
        }
    };

    // 3. Connection Status Listener
    useEffect(() => {
        if (!user || !selectedSessionId) return;

        const docRef = doc(db, "sessions", selectedSessionId, "connectedStudents", user.id);
        const unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists() && snap.data().status === 'CONNECTED') {
                joinedSessionIdRef.current = selectedSessionId;
            } else {
                joinedSessionIdRef.current = null;
            }
        });
        return () => unsubscribe();
    }, [user, selectedSessionId]);

    const joinSession = async (session: Session) => {
        if (!user || !deviceId) throw new Error("User or Device Identity Missing");

        const connectionRef = doc(db, "sessions", session.id, "connectedStudents", user.id);

        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(connectionRef);

            if (sfDoc.exists()) {
                const data = sfDoc.data();
                if (data.deviceId !== deviceId) {
                    throw new Error("Device Mismatch: You cannot join from a different device.");
                }
                // Already connected, ensure status is CONNECTED
                if (data.status !== 'CONNECTED') {
                    transaction.update(connectionRef, { status: 'CONNECTED', lastHeartbeat: serverTimestamp() });
                }
            } else {
                // New Connection - Bind Device
                transaction.set(connectionRef, {
                    studentId: user.id,
                    studentName: user.name,
                    deviceId: deviceId,
                    joinedAt: serverTimestamp(),
                    lastHeartbeat: serverTimestamp(),
                    status: 'CONNECTED'
                });
            }
        });
    };

    const markAttendance = async (session: Session, code?: string, currentDistance?: number) => {
        if (!user) return;
        setAttendanceStatus('JOINING'); // Status for UI spinner
        setMsg("Verifying Identity & Location...");

        try {
            // Step 1: Ensure Connected (Device Binding)
            await joinSession(session);

            // Step 2: Validate Geo
            const dist = currentDistance ?? 99999;
            // Strict 100m or Session Radius + Buffer. prompt says strict "Inside radius".
            // We use session.classroomLocation.radius.
            // Adding 20m buffer for GPS noise as requested "Increase tolerance slightly".
            const maxRadius = session.classroomLocation.radius + 20;

            if (dist > maxRadius) {
                throw new Error(`Location violation: You are ${Math.round(dist - maxRadius)}m outside the zone.`);
            }

            // Step 3: Validate Code (Dynamic QR)
            if (code) {
                const isQrMatch = code === session.currentQrCode;
                // BLE UUID also allowed for manual entry as per prompt "Manually entering BLE UUID"
                const isBleMatch = code === session.bleServiceUUID;

                if (!isQrMatch && !isBleMatch) {
                    throw new Error("Invalid Session Code or QR Expired.");
                }
            } else {
                // No code provided? Prompt says "Prevent attendance without QR".
                throw new Error("Attendance requires active QR Scan or Code Verification.");
            }

            // Step 4: Mark in Attendance Collection
            // Check if already marked
            const attendanceQ = query(collection(db, "attendance"), where("sessionId", "==", session.id), where("studentId", "==", user.id));
            const existing = await getDocs(attendanceQ);
            if (!existing.empty) {
                setAttendanceStatus('MARKED');
                setMsg("Attendance already recorded.");
                return;
            }

            await addDoc(collection(db, "attendance"), {
                sessionId: session.id,
                sessionSubject: session.subject,
                classroomName: session.classroomName,
                studentId: user.id,
                studentName: user.name,
                status: 'PRESENT',
                timestamp: serverTimestamp(),
                heartbeatLastSeen: serverTimestamp(),
                deviceId: deviceId,
                location: location
            });

            setAttendanceStatus('MARKED');
            setMsg("Attendance Verified & Marked!");

        } catch (e: any) {
            setAttendanceStatus('FAILED');
            setMsg(e.message);
        }
    };

    const handleManualJoin = async () => {
        // Try to find session by ID/UUID
        const session = sessions.find(s => s.id === manualId || s.bleServiceUUID === manualId);

        if (!session) {
            setMsg("Session not found with this ID/UUID.");
            return;
        }

        try {
            setMsg("Connecting...");
            await joinSession(session);
            setMsg("Successfully Joined! Now Scan QR to Mark Attendance.");
            setSelectedSessionId(session.id);
        } catch (e: any) {
            setMsg(e.message);
        }
    };

    const isConnected = joinedSessionIdRef.current === selectedSessionId;

    return (
        <div className="dashboard-container">
            <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap color="white" size={24} fill="currentColor" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Student Portal</h1>
                        <p style={{ color: '#94a3b8', margin: 0 }}>
                            {user?.name}
                            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
                            {location ? (
                                <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <MapPin size={12} /> GPS Active ±{Math.round(location.accuracy || 0)}m
                                </span>
                            ) : <span className="text-warning">Locating...</span>}
                        </p>
                    </div>
                </div>
                <button className="btn-secondary" onClick={() => { logout(); navigate('/login'); }}>
                    <LogOut size={16} />
                </button>
            </header>

            {attendanceStatus === 'MARKED' ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', margin: '2rem auto', maxWidth: '500px' }}>
                    <CheckCircle size={64} style={{ color: '#34d399', margin: '0 auto 1rem' }} />
                    <h2>Attendance Recorded</h2>
                    <p style={{ color: '#94a3b8' }}>You are present in {selectedSession?.subject}</p>
                    <div className="status-badge status-active" style={{ display: 'inline-flex', gap: '8px', marginTop: '1rem' }}>
                        <Wifi size={14} /> LIVE
                    </div>
                </div>
            ) : (
                <div style={{ padding: '0 1rem', maxWidth: '800px', margin: '0 auto', paddingBottom: '4rem' }}>

                    {/* Connection Status Banner */}
                    <AnimatePresence>
                        {isConnected && selectedSession && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="glass-panel"
                                style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem' }}
                            >
                                <Lock size={20} className="text-accent" />
                                <div>
                                    <strong style={{ color: '#34d399' }}>Securely Connected to {selectedSession.subject}</strong>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Device ID Bound. Waiting for Attendance QR Scan...</div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Top Action Bar (Scan / Manual) */}
                    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button className="btn-primary" onClick={() => startScanner()} style={{ flex: 1 }} disabled={scanning}>
                                <ScanLine size={18} /> {scanning ? 'Scanning...' : (isConnected ? 'Scan Attendance QR' : 'Scan to Join')}
                            </button>
                            {!isConnected && (
                                <>
                                    <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)' }}></div>
                                    <div style={{ flex: 2, display: 'flex', gap: '10px' }}>
                                        <input
                                            type="text"
                                            placeholder="Session ID / UUID"
                                            value={manualId}
                                            onChange={(e) => setManualId(e.target.value)}
                                            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', borderRadius: '8px', color: 'white' }}
                                        />
                                        <button className="btn-secondary" onClick={handleManualJoin}>Join</button>
                                    </div>
                                </>
                            )}
                        </div>
                        {msg && <div style={{ marginTop: '1rem', color: '#facc15', fontSize: '0.9rem', textAlign: 'center' }}>{msg}</div>}
                        {scanning && <div id="reader" style={{ marginTop: '1rem', borderRadius: '8px', overflow: 'hidden' }}></div>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Nearby Sessions */}
                        <div>
                            <h3 style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MapPin size={16} /> Nearby Sessions
                            </h3>
                            {sessions.length === 0 && <p style={{ color: '#64748b', fontSize: '0.9rem' }}>No active sessions found.</p>}
                            {sessions.map(s => (
                                <div key={s.id} onClick={() => handleSelectSession(s)} className={`glass-panel ${selectedSessionId === s.id ? 'border-accent' : ''}`} style={{ padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', border: selectedSessionId === s.id ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontWeight: 600 }}>{s.subject}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{s.classroomName}</div>
                                </div>
                            ))}
                        </div>

                        {/* Attendance History */}
                        <div>
                            <h3 style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={16} /> Recent History
                            </h3>
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {history.length === 0 && <p style={{ color: '#64748b', fontSize: '0.9rem' }}>No attendance records.</p>}
                                {history.map(record => (
                                    <div key={record.id} className="glass-panel" style={{ padding: '10px', marginBottom: '8px', borderLeft: '3px solid #34d399' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{record.sessionSubject || 'Unknown Subject'}</div>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.6, background: 'white', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>{record.status.split(' ')[0]}</div>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                            <Calendar size={10} /> {record.timestamp?.toDate ? new Date(record.timestamp.toDate()).toLocaleDateString() : 'Just now'}
                                            <Clock size={10} style={{ marginLeft: '8px' }} /> {record.timestamp?.toDate ? new Date(record.timestamp.toDate()).toLocaleTimeString() : ''}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>{record.classroomName || 'Unknown Classroom'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
