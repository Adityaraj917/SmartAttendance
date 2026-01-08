import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase'; // Ensure this matches your project structure
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs } from 'firebase/firestore';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { MapPin, CheckCircle, LogOut, ScanLine, Wifi, Zap, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface Session {
    id: string;
    subject: string;
    classroomName: string;
    classroomLocation: { lat: number; lon: number; radius: number };
    currentQrCode: string; // Needed for client verification
}

export default function StudentDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [scanning, setScanning] = useState(false);
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [attendanceStatus, setAttendanceStatus] = useState<'NONE' | 'MARKED' | 'FAILED'>('NONE');
    const [msg, setMsg] = useState('');
    const [location, setLocation] = useState<{ lat: number, lon: number } | null>(null);
    const [distance, setDistance] = useState<number | null>(null);

    // Track the attendance Doc ID for heartbeats
    const [attendanceDocId, setAttendanceDocId] = useState<string | null>(null);
    const heartbeatInterval = useRef<number | null>(null);

    // Real-time Session Listener
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

    // Geolocation Tracker
    useEffect(() => {
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                    setLocation(newLoc);
                    // Update distance if session selected
                    if (selectedSession) {
                        const d = getDistance(newLoc.lat, newLoc.lon, selectedSession.classroomLocation.lat, selectedSession.classroomLocation.lon);
                        setDistance(d);
                    }
                },
                (err) => console.error(err),
                { enableHighAccuracy: true, maximumAge: 10000 }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, [selectedSession]);

    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const handleSelectSession = (s: Session) => {
        if (!location) { alert("Enable location!"); return; }
        const d = getDistance(location.lat, location.lon, s.classroomLocation.lat, s.classroomLocation.lon);
        setDistance(d);
        setSelectedSession(s);

        if (d <= s.classroomLocation.radius + 100) setMsg(`In Range (${Math.round(d)}m)`); // +100m buffer for GPS drift/indoors
        else setMsg(`Too Far (${Math.round(d)}m)`);
        setAttendanceStatus('NONE'); // Reset status when switching
    };

    const startScanner = () => { if (selectedSession) { setScanning(true); setMsg(''); } };

    // QR Logic
    useEffect(() => {
        if (scanning && selectedSession) {
            const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
            scanner.render(async (txt) => {
                scanner.clear();
                setScanning(false);
                await markAttendance(txt);
            }, (err) => { console.log(err); }); // Error logic
            return () => { try { scanner.clear(); } catch (e) { } };
        }
    }, [scanning, selectedSession]);

    const markAttendance = async (qrCode: string) => {
        if (!selectedSession || !location || !user) return;

        // 1. Validate QR
        if (qrCode !== selectedSession.currentQrCode) {
            setAttendanceStatus('FAILED');
            setMsg("Invalid QR Code");
            return;
        }

        // 2. Validate Geo (Double check at moment of marking)
        const d = getDistance(location.lat, location.lon, selectedSession.classroomLocation.lat, selectedSession.classroomLocation.lon);
        // Allow user override for demo if "teleport" was used (distance would be ~0)
        // But enforce limit:
        if (d > selectedSession.classroomLocation.radius + 100) {
            setAttendanceStatus('FAILED');
            setMsg(`Location Verification Failed. Distance: ${Math.round(d)}m`);
            return;
        }

        try {
            // 3. Check for duplicates
            const q = query(
                collection(db, "attendance"),
                where("sessionId", "==", selectedSession.id),
                where("studentId", "==", user.id)
            );
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                setAttendanceStatus('MARKED');
                setMsg("Already Marked Present");
                setAttendanceDocId(querySnapshot.docs[0].id);
                startHeartbeat(querySnapshot.docs[0].id);
                return;
            }

            // 4. Write Record
            const docRef = await addDoc(collection(db, "attendance"), {
                sessionId: selectedSession.id,
                studentId: user.id,
                studentName: user.name,
                status: 'PRESENT',
                timestamp: serverTimestamp(),
                heartbeatLastSeen: serverTimestamp()
            });

            setAttendanceStatus('MARKED');
            setAttendanceDocId(docRef.id);
            startHeartbeat(docRef.id);

        } catch (e: any) {
            setAttendanceStatus('FAILED');
            setMsg(e.message);
            console.error(e);
        }
    };

    const startHeartbeat = (docId: string) => {
        if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);

        // Initial heartbeat
        updateHeartbeat(docId);

        heartbeatInterval.current = window.setInterval(() => {
            updateHeartbeat(docId);
        }, 30000); // 30 seconds heartbeat
    };

    const updateHeartbeat = async (docId: string) => {
        try {
            await updateDoc(doc(db, "attendance", docId), {
                heartbeatLastSeen: serverTimestamp()
            });
            console.log("Heartbeat sent");
        } catch (e) {
            console.error("Heartbeat failed", e);
        }
    };

    useEffect(() => () => { if (heartbeatInterval.current) clearInterval(heartbeatInterval.current); }, []);

    const teleportToClass = () => {
        if (selectedSession) {
            setLocation({ lat: selectedSession.classroomLocation.lat, lon: selectedSession.classroomLocation.lon });
            setDistance(0); setMsg("Debug: Teleported to class");
        }
    };

    return (
        <div className="dashboard-container">
            <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap color="white" size={24} fill="currentColor" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Student Portal</h1>
                        <p style={{ color: '#94a3b8', margin: 0 }}>ID: {user?.id} <span style={{ opacity: 0.5 }}>|</span> {location ? 'GPS Ready' : 'Locating...'}</p>
                    </div>
                </div>
                <button className="btn-secondary" onClick={() => { logout(); navigate('/login'); }}>
                    <LogOut size={16} />
                </button>
            </header>

            {attendanceStatus === 'MARKED' ? (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '500px', margin: '4rem auto' }}>
                    <motion.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', color: '#34d399' }}
                    >
                        <CheckCircle size={64} />
                    </motion.div>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Success!</h2>
                    <p style={{ fontSize: '1.1rem', color: '#94a3b8' }}>Checked in to <strong>{selectedSession?.subject}</strong>.</p>

                    <div style={{ marginTop: '3rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                        <div style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '50%' }} className="animate-pulse" />
                        <span style={{ color: '#60a5fa', fontSize: '0.9rem', fontWeight: 600 }}>Live Connection Active</span>
                    </div>
                </motion.div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                    {/* Radar Section */}
                    <section>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                            <Wifi className="text-accent animate-pulse" /> Detected Beacons
                        </h3>

                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {sessions.length === 0 && (
                                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                    <Loader2 size={32} className="animate-spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                    <p>Scanning for nearby classes...</p>
                                </div>
                            )}
                            {sessions.map(s => (
                                <motion.div
                                    key={s.id}
                                    className="glass-panel"
                                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(99, 102, 241, 0.1)' }}
                                    onClick={() => handleSelectSession(s)}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '1.5rem',
                                        border: selectedSession?.id === s.id ? '2px solid var(--accent-color)' : '1px solid var(--glass-border)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {selectedSession?.id === s.id && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: 'var(--accent-color)' }} />}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{s.subject}</h4>
                                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <MapPin size={14} /> {s.classroomName}
                                            </p>
                                        </div>
                                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 10px #34d399' }} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </section>

                    {/* Interaction Panel */}
                    <AnimatePresence>
                        {selectedSession && (
                            <motion.div
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                className="glass-panel"
                                style={{ padding: '2rem', height: 'fit-content' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ marginTop: 0, fontSize: '1.5rem', marginBottom: 0 }}>Entry Authorization</h3>
                                    <button onClick={() => {
                                        navigator.geolocation.getCurrentPosition(
                                            (pos) => {
                                                const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                                                setLocation(newLoc);
                                                if (selectedSession) {
                                                    const d = getDistance(newLoc.lat, newLoc.lon, selectedSession.classroomLocation.lat, selectedSession.classroomLocation.lon);
                                                    setDistance(d);
                                                }
                                                alert("GPS Signal Refreshed!");
                                            },
                                            (err) => alert("GPS Error: " + err.message),
                                            { enableHighAccuracy: true }
                                        );
                                    }} style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        Refresh GPS
                                    </button>
                                </div>
                                <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Verify your location to proceed.</p>

                                <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#94a3b8' }}>
                                        <span>Target Distance</span>
                                        <span>{distance ? Math.round(distance) : '...'}m / {selectedSession.classroomLocation.radius}m</span>
                                    </div>
                                    {/* Proximity Bar */}
                                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: distance ? `${Math.min(100, (selectedSession.classroomLocation.radius / distance) * 100)}%` : '0%' }}
                                            style={{ height: '100%', background: distance && distance <= selectedSession.classroomLocation.radius + 100 ? '#34d399' : '#f87171' }}
                                        />
                                    </div>
                                    {distance && distance > selectedSession.classroomLocation.radius && (
                                        <button onClick={teleportToClass} style={{ marginTop: '10px', fontSize: '0.8rem', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                            Developer Override: Teleport
                                        </button>
                                    )}
                                </div>

                                {msg && (
                                    <div style={{ marginBottom: '2rem', padding: '0.8rem', borderRadius: '8px', background: msg.includes('Too') || msg.includes('Failed') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: msg.includes('Too') || msg.includes('Failed') ? '#f87171' : '#34d399', fontSize: '0.9rem', fontWeight: 600, textAlign: 'center' }}>
                                        {msg}
                                    </div>
                                )}

                                {!scanning ? (
                                    <button
                                        className="btn-primary"
                                        onClick={startScanner}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
                                    >
                                        <ScanLine /> Initialize Scanner
                                    </button>
                                ) : (
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ overflow: 'hidden', borderRadius: '16px', border: '2px solid var(--accent-color)', marginBottom: '1rem' }}>
                                            <div id="reader"></div>
                                        </div>
                                        <button className="btn-secondary" onClick={() => setScanning(false)} style={{ width: '100%' }}>Abort Sequence</button>
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
