import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Mail, Loader2, Grip, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const data = await apiRequest('/auth/login', 'POST', { email, password });
            if (data.success) {
                login(data.user);
                navigate(data.user.role === 'TEACHER' ? '/teacher' : '/student');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>

            {/* Decorative Blobs */}
            <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

            <motion.div
                className="glass-panel"
                style={{ width: '100%', maxWidth: '420px', padding: '3rem', position: 'relative', zIndex: 10 }}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <motion.div
                        initial={{ rotate: -10, scale: 0.8 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200 }}
                        style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 10px 25px rgba(99,102,241,0.3)' }}
                    >
                        <Grip color="white" size={32} />
                    </motion.div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 10px 0', background: 'linear-gradient(to right, white, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Welcome Back
                    </h2>
                    <p style={{ color: '#94a3b8', margin: 0 }}>Sign in to access your dashboard</p>
                </div>

                {error && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '12px', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f87171' }} />
                        {error}
                    </motion.div>
                )}

                <form onSubmit={handleLogin}>
                    <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
                        <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', transition: 'color 0.2s' }} />
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ paddingLeft: '48px', height: '52px' }}
                            required
                        />
                    </div>

                    <div style={{ position: 'relative', marginBottom: '2.5rem' }}>
                        <KeyRound size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingLeft: '48px', height: '52px' }}
                            required
                        />
                    </div>

                    <button type="submit" className="btn-primary" style={{ width: '100%', height: '52px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', fontSize: '1rem' }} disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <><span>Sign In</span> <CheckCircle2 size={18} opacity={0.6} /></>}
                    </button>
                </form>

                <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Test Accounts</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div onClick={() => { setEmail('teacher@test.com'); setPassword('pass'); }} style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', border: '1px solid transparent', transition: 'all 0.2s' }} className="hover:bg-white/5 hover:border-white/10">
                            Teacher
                        </div>
                        <div onClick={() => { setEmail('student@test.com'); setPassword('pass'); }} style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8' }} className="hover:bg-white/5 hover:border-white/10">
                            Student
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
