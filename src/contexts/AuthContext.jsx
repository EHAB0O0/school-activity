import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEmergency, setIsEmergency] = useState(false);

    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    function logout() {
        setIsEmergency(false);
        return signOut(auth);
    }

    function activateEmergencyMode() {
        setIsEmergency(true);
        setCurrentUser({ uid: 'emergency', email: 'recovery@system', isAnonymous: true });
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            // If emergency mode is active, don't overwrite with null unless explicit logout
            if (!isEmergency) {
                setCurrentUser(user);
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
        isEmergency
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
