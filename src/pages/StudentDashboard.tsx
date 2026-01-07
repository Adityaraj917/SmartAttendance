import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { MapPin, CheckCircle, LogOut, ScanLine, Wifi, Zap, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface Session {
    id: string;
    subject: string;
    classroomName: string;
    classroomLocation: { lat: number; lon: number; radius: number };
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
    const heartbeatInterval = useRef<number | null>(null);

    useEffect(() => {
        const fetch = async () => setSessions(await apiRequest('/sessions/active').catch(() => []));
        fetch(); setInterval(fetch, 5000);
    }, []);

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                (err) => console.error(err),
                { enableHighAccuracy: true }
            );
        }
    }, []);

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

        if (d <= s.classroomLocation.radius + 50) setMsg(`In Range (${Math.round(d)}m)`);
        else setMsg(`Too Far (${Math.round(d)}m)`);
    };

    const startScanner = () => { if (selectedSession) setScanning(true); };

    useEffect(() => {
        if (scanning && selectedSession) {
            const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
            scanner.render(async (txt) => {
                scanner.clear(); setScanning(false); await markAttendance(txt);
            }, () => { });
            return () => { try { scanner.clear(); } catch (e) { } };
        }
    }, [scanning, selectedSession]);

    const markAttendance = async (qrCode: string) => {
        if (!selectedSession || !location) return;
        try {
            const res = await apiRequest('/attendance/mark', 'POST', {
                sessionId: selectedSession.id, studentId: user?.id, lat: location.lat, lon: location.lon, qrCode
            });
            if (res.success) {
                setAttendanceStatus('MARKED');
                startHeartbeat(selectedSession.id);
            } else {
                setAttendanceStatus('FAILED'); setMsg(res.message);
            }
        } catch (e: any) { setAttendanceStatus('FAILED'); setMsg(e.message); }
    };

    const startHeartbeat = (sessionId: string) => {
        if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = window.setInterval(() => {
            apiRequest('/attendance/heartbeat', 'POST', { sessionId, studentId: user?.id }).catch(console.error);
        }, 10000);
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
                                <h3 style={{ marginTop: 0, fontSize: '1.5rem' }}>Entry Authorization</h3>
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
                                            style={{ height: '100%', background: distance && distance <= selectedSession.classroomLocation.radius + 50 ? '#34d399' : '#f87171' }}
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
