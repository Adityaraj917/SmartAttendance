import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { QRCodeCanvas } from 'qrcode.react';
import { Users, MapPin, LogOut, Clock, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getCurrentLocation, getDistanceInMeters } from '../lib/geo'; // Import shared utility

interface Classroom {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
}

interface Session {
    id: string;
    subject: string;
    currentQrCode: string;
    classroomId: string;
    classroomName: string;
    isActive: boolean;
    bleServiceUUID?: string;
    classroomLocation: { lat: number, lon: number, radius: number };
    heartbeatNonce?: string;
    heartbeatAt?: any;
}

interface AttendanceRecord {
    id: string;
    studentId: string;
    studentName: string;
    timestamp: any; // Firestore timestamp
    status: string;
    heartbeatLastSeen?: any;
    location?: { lat: number, lon: number, accuracy: number };
}

export default function TeacherDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [session, setSession] = useState<Session | null>(null);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [subject, setSubject] = useState('');
    const [loading, setLoading] = useState(false);
    const [useMyLocation, setUseMyLocation] = useState(true);
    const [teacherLocation, setTeacherLocation] = useState<{ lat: number, lon: number, accuracy?: number } | null>(null);
    const [loadingLocation, setLoadingLocation] = useState(false);

    const refreshLocation = async () => {
        setLoadingLocation(true);
        try {
            const pos = await getCurrentLocation();
            setTeacherLocation(pos);
        } catch (e: any) {
            console.error("Failed to get location", e);
            alert("Could not get location: " + e.message);
            setTeacherLocation(null);
        } finally {
            setLoadingLocation(false);
        }
    };

    // Initial Location Fetch
    useEffect(() => {
        if (useMyLocation) refreshLocation();
    }, [useMyLocation]);

    // Fetch Classrooms on Mount
    useEffect(() => {
        const fetchClassrooms = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "classrooms"));
                const list: Classroom[] = [];
                querySnapshot.forEach((doc) => {
                    list.push({ id: doc.id, ...doc.data() } as Classroom);
                });
                setClassrooms(list);
            } catch (e) {
                console.error("Error fetching classrooms:", e);
            }
        };
        fetchClassrooms();
    }, []);

    // Restore Active Session
    useEffect(() => {
        const checkActiveSession = async () => {
            if (!user?.id) return;
            try {
                const q = query(
                    collection(db, "sessions"),
                    where("teacherId", "==", user.id),
                    where("isActive", "==", true)
                );
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const docData = snapshot.docs[0];
                    setSession({ id: docData.id, ...docData.data() } as Session);
                }
            } catch (e) {
                console.error("Error restoring session:", e);
            }
        };
        checkActiveSession();
    }, [user?.id]);

    const [connectedStudents, setConnectedStudents] = useState<any[]>([]);

    // Real-time Attendance Listener
    useEffect(() => {
        if (!session?.id) return;

        // 1. Attendance (Marked)
        const qVideo = query(collection(db, "attendance"), where("sessionId", "==", session.id));
        const unsubscribeAttendance = onSnapshot(qVideo, (snapshot) => {
            const list: AttendanceRecord[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
            });
            list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setAttendance(list);
        });

        // 2. Connected Students (Joined)
        const qConnected = collection(db, "sessions", session.id, "connectedStudents");
        const unsubscribeConnected = onSnapshot(qConnected, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setConnectedStudents(list);
        });

        return () => {
            unsubscribeAttendance();
            unsubscribeConnected();
        };
    }, [session?.id]);

    const createSession = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const selectedClassroom = classrooms.find(c => c.id === selectedClassId);
        if (!selectedClassroom) {
            alert("Please select a classroom");
            setLoading(false);
            return;
        }

        let lat = selectedClassroom.latitude;
        let lon = selectedClassroom.longitude;

        if (useMyLocation) {
            try {
                const pos = await getCurrentLocation(); // Use robust utility
                lat = pos.lat;
                lon = pos.lon;
            } catch (err: any) {
                console.error("Location access denied/failed:", err);
                alert(`Location Error: ${err.message}. Using default classroom coordinates.`);
                // Fallback to defaults
                lat = selectedClassroom.latitude;
                lon = selectedClassroom.longitude;
            }
        }

        try {
            const newSessionPayload = {
                teacherId: user?.id,
                teacherName: user?.name,
                classroomId: selectedClassId,
                classroomName: selectedClassroom.name,
                subject,
                isActive: true,
                currentQrCode: Math.random().toString(36).substring(2, 10),
                bleServiceUUID: '0000' + Math.random().toString(16).slice(2, 6) + '-0000-1000-8000-00805f9b34fb', // Standard BLE Format (Mocked prefix)
                classroomLocation: { lat, lon, radius: selectedClassroom.radiusMeters },
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, "sessions"), newSessionPayload);

            setSession({
                id: docRef.id,
                ...newSessionPayload
            } as any);

        } catch (e) {
            console.error(e);
            alert('Failed to create session');
        } finally {
            setLoading(false);
        }
    };

    // Heartbeat Emitter (Runs every 10 minutes)
    useEffect(() => {
        if (!session?.id || !session.isActive) return;

        const emitHeartbeat = async () => {
            try {
                const nonce = Math.random().toString(36).substring(2, 12);
                await updateDoc(doc(db, "sessions", session.id), {
                    heartbeatNonce: nonce,
                    heartbeatAt: serverTimestamp()
                });
                console.log(`Heartbeat emitted: ${nonce}`);
            } catch (e) {
                console.error("Failed to emit heartbeat", e);
            }
        };

        // Emit immediately on load if needed or just wait for interval
        // But better to emit one initially if missing? No, createSession does it.

        const interval = setInterval(emitHeartbeat, 10 * 60 * 1000); // 10 mins

        // Dynamic QR Rotation (Every 3 mins)
        const qrInterval = setInterval(async () => {
            try {
                const newQr = Math.random().toString(36).substring(2, 12);
                await updateDoc(doc(db, "sessions", session.id), {
                    currentQrCode: newQr
                });
            } catch (e) {
                console.error("QR Rotation failed", e);
            }
        }, 3 * 60 * 1000);

        return () => {
            clearInterval(interval);
            clearInterval(qrInterval);
        };
    }, [session?.id, session?.isActive]);

    const endSession = async () => {
        if (!session) return;
        if (confirm('End this session?')) {
            try {
                await updateDoc(doc(db, "sessions", session.id), {
                    isActive: false
                });
                setSession(null);
                setAttendance([]);
            } catch (e) {
                console.error("Error ending session:", e);
                alert("Failed to end session");
            }
        }
    };

    const handleLogout = () => { logout(); navigate('/login'); }

    return (
        <div className="dashboard-container">
            <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px rgba(59,130,246,0.3)' }}>
                        <Sparkles color="white" size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Teacher Dashboard</h1>
                        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>Welcome back, {user?.name}</p>
                    </div>
                </div>
                <button className="btn-secondary" onClick={handleLogout} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <LogOut size={16} /> <span>Logout</span>
                </button>
            </header>

            <AnimatePresence mode="wait">
                {!session ? (
                    <motion.div
                        key="create-form"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-panel"
                        style={{ maxWidth: '500px', margin: '4rem auto', padding: '3rem', position: 'relative' }}
                    >
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderTopLeftRadius: '20px', borderTopRightRadius: '20px' }} />

                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem', fontSize: '1.75rem' }}>
                            <Clock className="text-accent" size={32} />
                            New Session
                        </h2>
                        <form onSubmit={createSession}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '10px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>Select Classroom</label>
                                <div style={{ position: 'relative' }}>
                                    <MapPin size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#6366f1' }} />
                                    <select
                                        style={{ paddingLeft: '48px' }}
                                        value={selectedClassId}
                                        onChange={e => setSelectedClassId(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Choose Location --</option>
                                        {classrooms.map(c => <option key={c.id} value={c.id}>{c.name} ({c.radiusMeters}m)</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={useMyLocation}
                                        onChange={e => setUseMyLocation(e.target.checked)}
                                        style={{ width: '20px', height: '20px' }}
                                    />
                                    <span style={{ fontSize: '0.95rem', color: '#f8fafc' }}>Use my current location</span>
                                </label>

                                {useMyLocation && (
                                    <div style={{ marginLeft: '32px', fontSize: '0.85rem', color: '#94a3b8' }}>
                                        {loadingLocation ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Loader2 className="animate-spin" size={12} /> Acquiring GPS...</span>
                                        ) : teacherLocation ? (
                                            <div>
                                                <div style={{ color: '#34d399', fontWeight: 600 }}>
                                                    ✓ GPS Locked (±{Math.round(teacherLocation.accuracy || 0)}m)
                                                </div>
                                                <div style={{ fontFamily: 'monospace', opacity: 0.8 }}>
                                                    {teacherLocation.lat.toFixed(6)}, {teacherLocation.lon.toFixed(6)}
                                                </div>
                                            </div>
                                        ) : (
                                            <span style={{ color: '#f87171' }}>⚠ Location not available</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={refreshLocation}
                                            style={{ marginTop: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                        >
                                            Retry GPS
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '2.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '10px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>Subject Name</label>
                                <input type="text" style={{ fontSize: '1.1rem', fontWeight: 600 }} placeholder="e.g. Advanced AI Systems" value={subject} onChange={e => setSubject(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn-primary" style={{ width: '100%', height: '56px', fontSize: '1.1rem' }} disabled={loading || (useMyLocation && !teacherLocation)}>
                                {loading ? 'Creating Session...' : 'Launch Session'}
                            </button>
                        </form>
                    </motion.div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                        {/* Left Col: Control Panel */}
                        <motion.div
                            key="session-active"
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="glass-panel"
                            style={{ padding: '0', overflow: 'hidden' }}
                        >
                            <div style={{ padding: '2rem', background: 'rgba(99, 102, 241, 0.1)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <h2 style={{ margin: '0', fontSize: '1.8rem' }}>{session.subject}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: '#94a3b8' }}>
                                    <MapPin size={16} /> {session.classroomName}
                                </div>
                            </div>

                            <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                                <div style={{
                                    position: 'relative',
                                    width: '240px',
                                    height: '240px',
                                    margin: '0 auto 2rem',
                                    background: 'white',
                                    padding: '16px',
                                    borderRadius: '24px',
                                    boxShadow: '0 0 40px rgba(99, 102, 241, 0.2)'
                                }}>
                                    <QRCodeCanvas value={session.currentQrCode} size={208} />
                                    {/* Scanning Bar Animation */}
                                    <motion.div
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#ef4444', boxShadow: '0 0 10px #ef4444' }}
                                        animate={{ top: ['0%', '100%', '0%'] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                    />
                                </div>
                                <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', fontSize: '0.9rem', color: '#94a3b8' }}>
                                    Session ID: <span style={{ color: 'white', fontFamily: 'monospace' }}>{session.id}</span>
                                </div>
                                <div style={{ marginTop: '8px', padding: '8px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', fontSize: '0.9rem', color: '#94a3b8' }}>
                                    BLE UUID: <span style={{ color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.8rem' }}>{session.bleServiceUUID || 'N/A'}</span>
                                </div>
                                {session.heartbeatNonce && (
                                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                        Heartbeat Nonce: <span style={{ color: '#34d399', fontFamily: 'monospace' }}>{session.heartbeatNonce}</span>
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <button onClick={endSession} className="btn-secondary" style={{ width: '100%', borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)' }}>
                                    End Session
                                </button>
                            </div>
                        </motion.div>

                        {/* Right Col: Live List */}
                        <motion.div
                            initial={{ x: 30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="glass-panel"
                            style={{ display: 'flex', flexDirection: 'column', height: '650px' }}
                        >
                            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Users className="text-accent" /> Live Attendance
                                </h3>
                                <span className="status-badge status-active" style={{ fontSize: '1rem', padding: '8px 16px' }}>
                                    {attendance.length} Total
                                </span>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                {attendance.length === 0 ? (
                                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                        <Users size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                                        <p>Waiting for students to join...</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {/* Show Connected Students who haven't marked yet first, or just mix them? */}
                                        {(() => {
                                            // Merge Logic
                                            const map = new Map();

                                            // 1. Add Connected
                                            connectedStudents.forEach(s => {
                                                map.set(s.studentId, {
                                                    name: s.studentName,
                                                    status: 'JOINED', // Initial status
                                                    isOnline: true, // If in connected list, check heartbeat? 
                                                    // Connected list has lastHeartbeat. 
                                                    // We can check s.lastHeartbeat vs Now
                                                    lastHeartbeat: s.lastHeartbeat
                                                });
                                            });

                                            // 2. Overlay Attendance (Marked)
                                            attendance.forEach(a => {
                                                const existing = map.get(a.studentId);
                                                map.set(a.studentId, {
                                                    name: a.studentName,
                                                    status: a.status, // PRESENT / VERIFIED
                                                    location: a.location,
                                                    lastHeartbeat: a.heartbeatLastSeen || existing?.lastHeartbeat,
                                                    isOnline: true // Logic below will refine
                                                });
                                            });

                                            return Array.from(map.entries()).map(([sid, data], i) => {
                                                const now = new Date();
                                                const lastSeen = data.lastHeartbeat?.seconds ? new Date(data.lastHeartbeat.seconds * 1000) : null;
                                                const isOnline = lastSeen ? (now.getTime() - lastSeen.getTime()) < 15 * 60 * 1000 : true;
                                                const isMarked = data.status.includes('PRESENT');

                                                const dist = data.location ? getDistanceInMeters(
                                                    data.location.lat, data.location.lon,
                                                    session.classroomLocation.lat, session.classroomLocation.lon
                                                ) : null;

                                                return (
                                                    <motion.div
                                                        key={sid}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: isMarked ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', borderRadius: '12px', border: isMarked ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.03)' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isOnline ? (isMarked ? 'linear-gradient(135deg, #10b981, #059669)' : '#6366f1') : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                                                {data.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <p style={{ margin: 0, fontWeight: 500 }}>{data.name}</p>
                                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                                                    {dist !== null ? `${Math.round(dist)}m • ` : ''} {data.status}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className={`status-badge ${isOnline ? 'status-active' : ''}`} style={{ opacity: isOnline ? 1 : 0.5 }}>
                                                            {isOnline ? 'Active' : 'Silent'}
                                                        </div>
                                                    </motion.div>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
