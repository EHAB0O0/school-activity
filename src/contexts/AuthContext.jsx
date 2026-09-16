/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEmergency, setIsEmergency] = useState(false);

    async function login(email, password) {
        try {
            const res = await signInWithEmailAndPassword(auth, email, password);
            setIsEmergency(false);
            localStorage.removeItem('emergency_session');
            return res;
        } catch (authError) {
            // Fallback: Check if password was updated via Emergency Key in Firestore settings/global
            try {
                const docSnap = await getDoc(doc(db, "settings", "global"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const adminEmail = data.adminEmail || "admin@school.com";
                    if (data.adminPassword && data.adminPassword === password && (email.trim().toLowerCase() === adminEmail.toLowerCase() || email.trim().toLowerCase() === "admin@school.com")) {
                        const fallbackUser = {
                            uid: 'admin-fallback',
                            email: email || adminEmail,
                            isFallback: true
                        };
                        setCurrentUser(fallbackUser);
                        setIsEmergency(false);
                        localStorage.setItem('emergency_session', JSON.stringify(fallbackUser));
                        return { user: fallbackUser };
                    }
                }
            } catch (fallbackError) {
                console.error("Fallback auth check error:", fallbackError);
            }
            throw authError;
        }
    }

    function logout() {
        setIsEmergency(false);
        localStorage.removeItem('emergency_session');
        setCurrentUser(null);
        return signOut(auth);
    }

    function activateEmergencyMode() {
        setIsEmergency(true);
        setCurrentUser({ uid: 'emergency', email: 'recovery@system', isAnonymous: true });
    }

    function completeEmergencyReset(newAdminUser) {
        setIsEmergency(false);
        setCurrentUser(newAdminUser);
        localStorage.setItem('emergency_session', JSON.stringify(newAdminUser));
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!isEmergency) {
                if (user) {
                    setCurrentUser(user);
                } else {
                    // Check if fallback session exists
                    const saved = localStorage.getItem('emergency_session');
                    if (saved) {
                        try {
                            setCurrentUser(JSON.parse(saved));
                        } catch {
                            setCurrentUser(null);
                        }
                    } else {
                        setCurrentUser(null);
                    }
                }
            }
            setLoading(false);
        });
        return unsubscribe;
    }, [isEmergency]);

    const value = {
        currentUser,
        login,
        logout,
        activateEmergencyMode,
        completeEmergencyReset,
        isEmergency
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
