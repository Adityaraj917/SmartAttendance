import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { MapPin, CheckCircle, LogOut, ScanLine, Wifi, Zap, Loader2 } from 'lucide-react';
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
}

export default function StudentDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [scanning, setScanning] = useState(false);
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [attendanceStatus, setAttendanceStatus] = useState<'NONE' | 'JOINING' | 'MARKED' | 'FAILED'>('NONE');
    const [msg, setMsg] = useState('');
    const [location, setLocation] = useState<{ lat: number, lon: number; accuracy?: number } | null>(null);
    const [distance, setDistance] = useState<number | null>(null);
    const [autoJoinEnabled, setAutoJoinEnabled] = useState(true);

    const heartbeatInterval = useRef<number | null>(null);
    const joinedSessionIdRef = useRef<string | null>(null); // To prevent double joining

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

                // Check distance for selected session (visual feedback)
                if (selectedSession) {
                    const d = getDistanceInMeters(newLoc.lat, newLoc.lon, selectedSession.classroomLocation.lat, selectedSession.classroomLocation.lon);
                    setDistance(d);
                }

                // AUTO-JOIN LOGIC
                if (autoJoinEnabled && attendanceStatus === 'NONE' && !joinedSessionIdRef.current) {
                    for (const s of sessions) {
                        const d = getDistanceInMeters(newLoc.lat, newLoc.lon, s.classroomLocation.lat, s.classroomLocation.lon);
                        // Join if distance <= radius (with slight buffer for GPS jitter, e.g. +10m)
                        if (d <= s.classroomLocation.radius + 10) {
                            console.log(`Auto-joining session: ${s.subject} (Dist: ${Math.round(d)}m)`);
                            setSelectedSession(s);
                            setDistance(d);
                            await markAttendance(s, undefined, d); // No QR needed
                            break; // Join the first one found
                        }
                    }
                }
            },
            (err) => {
                console.error("GPS Error:", err);
                if (err.code === 1) setMsg("Location Permission Denied");
                else if (err.code === 3) setMsg("GPS Timeout - Retrying...");
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [sessions, selectedSession, autoJoinEnabled, attendanceStatus]); // Re-run if sessions list changes

    const handleSelectSession = (s: Session) => {
        if (!location) { alert("Waiting for location..."); return; }
        const d = getDistanceInMeters(location.lat, location.lon, s.classroomLocation.lat, s.classroomLocation.lon);
        setDistance(d);
        setSelectedSession(s);

        if (d <= s.classroomLocation.radius + 20) setMsg(`In Range (${Math.round(d)}m)`);
        else setMsg(`Too Far (${Math.round(d)}m)`);

        // Don't reset status if we are already marked for THIS session
        if (joinedSessionIdRef.current !== s.id) {
            setAttendanceStatus('NONE');
        }
    };

    const startScanner = () => { if (selectedSession) { setScanning(true); setMsg(''); } };

    // QR Scanner Logic (Refactored for Stability)
    useEffect(() => {
        let html5QrCode: Html5Qrcode | null = null;

        const startScanning = async () => {
            if (scanning && selectedSession) {
                try {
                    // Slight delay to ensure DOM element exists
                    await new Promise(r => setTimeout(r, 100));

                    if (!document.getElementById("reader")) return;

                    html5QrCode = new Html5Qrcode("reader");
                    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

                    await html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        async (decodedText) => {
                            // Success
                            await html5QrCode?.stop().catch(console.error);
                            html5QrCode?.clear();
                            setScanning(false);

                            if (location) {
                                const d = getDistanceInMeters(location.lat, location.lon, selectedSession.classroomLocation.lat, selectedSession.classroomLocation.lon);
                                await markAttendance(selectedSession, decodedText, d);
                            }
                        },
                        (_errorMessage) => {
                            // parse error, ignore
                        }
                    );
                } catch (err) {
                    console.error("Scanner Error:", err);
                    setMsg("Scanner failed to start. Check permissions.");
                    setScanning(false);
                }
            }
        };

        if (scanning) {
            startScanning();
        }

        return () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => html5QrCode?.clear()).catch(console.error);
            }
        };
    }, [scanning, selectedSession]);

    const markAttendance = async (session: Session, qrCode?: string, currentDistance?: number) => {
        if (!user) return;
        setAttendanceStatus('JOINING');
        setMsg("Verifying...");

        // 1. Validate QR (If provided)
        if (qrCode && qrCode !== session.currentQrCode) {
            setAttendanceStatus('FAILED');
            setMsg("Invalid QR Code");
            return;
        }

        // 2. Validate Geo (Strict)
        const dist = currentDistance ?? 99999;
        const maxDist = session.classroomLocation.radius + 50; // 50m buffer for error

        if (dist > maxDist) {
            setAttendanceStatus('FAILED');
            setMsg(`Too far to join! (${Math.round(dist)}m)`);
            return;
        }

        try {
            // 3. Check/Create Record
            const q = query(
                collection(db, "attendance"),
                where("sessionId", "==", session.id),
                where("studentId", "==", user.id)
            );
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                setAttendanceStatus('MARKED');
                setMsg("Welcome Back!");
                joinedSessionIdRef.current = session.id;
                startHeartbeat(querySnapshot.docs[0].id);
                return;
            }

            // 4. Create New Record
            const docRef = await addDoc(collection(db, "attendance"), {
                sessionId: session.id,
                studentId: user.id,
                studentName: user.name,
                status: qrCode ? 'PRESENT (QR)' : 'PRESENT (AUTO-GPS)',
                timestamp: serverTimestamp(),
                heartbeatLastSeen: serverTimestamp(),
                device: navigator.userAgent,
                location: location ? { lat: location.lat, lon: location.lon, accuracy: location.accuracy } : null
            });

            setAttendanceStatus('MARKED');
            joinedSessionIdRef.current = session.id;
            startHeartbeat(docRef.id);

        } catch (e: any) {
            setAttendanceStatus('FAILED');
            setMsg("Error: " + e.message);
            console.error(e);
        }
    };

    const startHeartbeat = (docId: string) => {
        if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);

        // Initial heartbeat
        updateHeartbeat(docId);

        // Send heartbeat every 10 minutes (600,000 ms)
        heartbeatInterval.current = window.setInterval(() => {
            updateHeartbeat(docId);
        }, 10 * 60 * 1000);
    };

    const updateHeartbeat = async (docId: string) => {
        try {
            const updates: any = {
                heartbeatLastSeen: serverTimestamp()
            };

            // If we have a fresh location, update it
            if (location) {
                updates.location = {
                    lat: location.lat,
                    lon: location.lon,
                    accuracy: location.accuracy
                };
            }

            await updateDoc(doc(db, "attendance", docId), updates);
            console.log("Heartbeat sent at", new Date().toISOString());
        } catch (e) {
            console.error("Heartbeat failed", e);
        }
    };

    useEffect(() => () => { if (heartbeatInterval.current) clearInterval(heartbeatInterval.current); }, []);

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
                                    GPS Active <span style={{ fontSize: '0.7em', padding: '2px 4px', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '4px' }}>±{Math.round(location.accuracy || 0)}m</span>
                                </span>
                            ) : (
                                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Loader2 size={12} className="animate-spin" /> Locating...
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <button className="btn-secondary" onClick={() => { logout(); navigate('/login'); }}>
                    <LogOut size={16} />
                </button>
            </header>

            {attendanceStatus === 'MARKED' ? (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '500px', margin: '2rem auto' }}>
                    <motion.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', color: '#34d399' }}
                    >
                        <CheckCircle size={64} />
                    </motion.div>
                    <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Checked In!</h2>
                    <p style={{ fontSize: '1.2rem', color: '#f8fafc', marginBottom: '2rem' }}>
                        You are present in <strong>{selectedSession?.subject}</strong>
                    </p>

                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <div className="status-badge status-active">
                            <Wifi size={14} /> Connected
                        </div>
                    </div>
                </motion.div>
            ) : (
                <div style={{ maxWidth: '600px', margin: '0 auto', display: 'grid', gap: '2rem' }}>

                    {/* Auto-Join Status Strip */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ position: 'relative' }}>
                                <Wifi size={20} className={autoJoinEnabled ? "text-accent" : "text-muted"} />
                                {autoJoinEnabled && <span style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, background: '#34d399', borderRadius: '50%' }} className="animate-pulse" />}
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Auto-Join Nearby Classes</span>
                        </div>
                        <label className="switch">
                            <input type="checkbox" checked={autoJoinEnabled} onChange={e => setAutoJoinEnabled(e.target.checked)} />
                            <span className="slider round"></span>
                        </label>
                    </div>

                    {/* Active Sessions List */}
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#94a3b8', paddingLeft: '4px' }}>Available Sessions</h3>

                        {sessions.length === 0 && (
                            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                <Loader2 size={32} className="animate-spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                <p>Searching for active classes...</p>
                            </div>
                        )}

                        {sessions.map(s => {
                            const dist = location ? getDistanceInMeters(location.lat, location.lon, s.classroomLocation.lat, s.classroomLocation.lon) : null;
                            const isClose = dist !== null && dist <= s.classroomLocation.radius + 20;

                            return (
                                <motion.div
                                    key={s.id}
                                    className="glass-panel"
                                    whileHover={{ scale: 1.01 }}
                                    onClick={() => handleSelectSession(s)}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '1.5rem',
                                        border: selectedSession?.id === s.id ? '2px solid var(--accent-color)' : '1px solid var(--glass-border)',
                                        background: isClose ? 'linear-gradient(145deg, rgba(16, 185, 129, 0.05), rgba(0,0,0,0.2))' : undefined,
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '1.2rem' }}>{s.subject}</h4>
                                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <MapPin size={14} /> {s.classroomName}
                                            </p>
                                        </div>
                                        {dist !== null && (
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: isClose ? '#34d399' : '#f87171' }}>
                                                    {Math.round(dist)}m
                                                </span>
                                                <br />
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dist</span>
                                            </div>
                                        )}
                                    </div>

                                    {isClose && (
                                        <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                                            <CheckCircle size={12} /> Within Range
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Manual Entry (Fallback) */}
                    <AnimatePresence>
                        {selectedSession && !attendanceStatus.includes('MARKED') && (
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="glass-panel"
                                style={{ padding: '2rem' }}
                            >
                                <h3 style={{ marginTop: 0 }}>Manual Check-in</h3>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <p style={{ color: '#94a3b8', margin: 0 }}>Auto-join didn't work? Try scanning the QR code.</p>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: distance && distance <= selectedSession.classroomLocation.radius + 20 ? '#34d399' : '#f87171', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px' }}>
                                        {distance ? `${Math.round(distance)}m Away` : '...'}
                                    </span>
                                </div>

                                {msg && (
                                    <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', textAlign: 'center', color: '#f8fafc' }}>
                                        {msg}
                                    </div>
                                )}

                                {!scanning ? (
                                    <button className="btn-primary" onClick={startScanner} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                        <ScanLine /> Scan QR Code
                                    </button>
                                ) : (
                                    <div>
                                        <div id="reader" style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid #3b82f6', marginBottom: '1rem' }}></div>
                                        <button className="btn-secondary" onClick={() => setScanning(false)} style={{ width: '100%' }}>Cancel Scan</button>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
