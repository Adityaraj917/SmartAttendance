import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';

const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode, allowedRole: 'TEACHER' | 'STUDENT' }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role !== allowedRole) {
        // Redirect to their appropriate dashboard
        return <Navigate to={user.role === 'TEACHER' ? '/teacher' : '/student'} replace />;
    }

    return children;
};

const AppRoutes = () => {
    const { user } = useAuth();

    return (
        <Routes>
            <Route path="/login" element={user ? <Navigate to={user.role === 'TEACHER' ? '/teacher' : '/student'} /> : <Login />} />

            <Route path="/teacher" element={
                <ProtectedRoute allowedRole="TEACHER">
                    <TeacherDashboard />
                </ProtectedRoute>
            } />

            <Route path="/student" element={
                <ProtectedRoute allowedRole="STUDENT">
                    <StudentDashboard />
                </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
