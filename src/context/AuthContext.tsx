import { createContext, useContext, useState, type ReactNode, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export type Role = 'TEACHER' | 'STUDENT';

interface User {
    id: string;
    name: string;
    role: Role;
    email?: string;
}

interface AuthContextType {
    user: User | null;
    loginWithCredentials: (email: string, pass: string) => Promise<void>;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('user');
        if (saved) {
            setUser(JSON.parse(saved));
        }
        setLoading(false);
    }, []);

    const loginWithCredentials = async (email: string, pass: string) => {
        // Query "users" collection (using email as ID or field? Seeder used ID=email_replaced, but let's query field to be safe or use ID get)
        // Seeder: setDoc(doc(db, "users", email.replace...))
        // So we can try to get doc directly or query. Query is safer if we change ID strategy.
        // Let's query by field 'email' and 'password' (In production, never store plaintext password. For this prototype, it is requested).

        // Simulating delay for effect
        await new Promise(r => setTimeout(r, 800));

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email), where('password', '==', pass));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            throw new Error("Invalid email or password");
        }

        const userDoc = snapshot.docs[0].data() as User;

        // Ensure ID is present
        const userData = { ...userDoc, id: snapshot.docs[0].id };

        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider value={{ user, loginWithCredentials, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
