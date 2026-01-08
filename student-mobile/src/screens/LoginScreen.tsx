import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';

interface Props {
    onLogin: (user: any) => void;
}

export default function LoginScreen({ onLogin }: Props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        setLoading(true);
        try {
            // Query users collection
            const q = query(collection(db, 'users'), where('email', '==', email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                Alert.alert('Error', 'User not found');
                setLoading(false);
                return;
            }

            let foundUser: any = null;
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                // Simple password check (plaintext as per prompt requirements)
                if (userData.password === password) {
                    foundUser = { id: doc.id, ...userData };
                }
            });

            if (foundUser) {
                if (foundUser.role !== 'STUDENT') {
                    Alert.alert('Access Denied', 'This app is for Students only. Teachers please use the Web Dashboard.');
                } else {
                    onLogin(foundUser);
                }
            } else {
                Alert.alert('Error', 'Invalid Password');
            }
        } catch (error: any) {
            console.error(error);
            Alert.alert('Login Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={styles.card}>
                <Text style={styles.title}>Smart Attendance</Text>
                <Text style={styles.subtitle}>Student Login</Text>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Email / Username</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Aditya@VGU"
                        placeholderTextColor="#64748b"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#64748b"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>Login</Text>
                    )}
                </TouchableOpacity>

                <Text style={styles.footer}>Produce Real-Time Attendance</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#1e293b',
        padding: 30,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#334155',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 16,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 30,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        color: '#cbd5e1',
        marginBottom: 8,
        fontSize: 14,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 16,
        color: 'white',
        borderWidth: 1,
        borderColor: '#334155',
        fontSize: 16,
    },
    button: {
        backgroundColor: '#3b82f6',
        padding: 18,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    footer: {
        marginTop: 20,
        textAlign: 'center',
        color: '#475569',
        fontSize: 12,
    }
});
