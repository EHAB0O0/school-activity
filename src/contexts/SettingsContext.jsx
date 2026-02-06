import { createContext, useContext, useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, updateDoc, getDoc, collection, addDoc, setDoc } from "firebase/firestore";

const SettingsContext = createContext();

export function useSettings() {
    return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(null);
    const [activeProfile, setActiveProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Subscribe to global settings
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings(data);
                // If active profile changes, fetch the profile data
                if (data.activeProfileId) {
                    fetchTimeProfile(data.activeProfileId);
                } else {
                    setLoading(false);
                }
            } else {
                // Initialize default settings if missing? (Or handled by admin)
                setSettings({});
                setLoading(false);
            }
        }, (error) => {
            console.error("Error fetching settings:", error);
            setLoading(false);
        });
        return unsub;
    }, []);

    async function fetchTimeProfile(profileId) {
        try {
            const profileSnap = await getDoc(doc(db, "time_profiles", profileId));
            if (profileSnap.exists()) {
                setActiveProfile(profileSnap.data());
            }
        } catch (error) {
            console.error("Error fetching time profile:", error);
        } finally {
            setLoading(false);
        }
    }

    async function switchProfile(profileId) {
        if (!settings) return;
        await updateDoc(doc(db, "settings", "global"), {
            activeProfileId: profileId
        });
        // The snapshot listener will trigger fetchTimeProfile
    }

    async function saveTimeProfile(profile) {
        // Remove 'id' from the data payload so we don't duplicate it inside the doc
        const { id, ...data } = profile;

        if (id) {
            const ref = doc(db, "time_profiles", id);
            await setDoc(ref, data, { merge: true });
            return id;
        } else {
            const docRef = await addDoc(collection(db, "time_profiles"), data);
            return docRef.id;
        }
    }

    async function updateSchoolInfo(info) {
        await updateDoc(doc(db, "settings", "global"), {
            schoolInfo: info
        });
    }

    async function updateEventTypes(newTypes) {
        await updateDoc(doc(db, "settings", "global"), {
            eventTypes: newTypes
        });
    }

    async function updateGrades(gradesStructure) {
        await updateDoc(doc(db, "settings", "global"), {
            grades: gradesStructure // [{ id, name, sections: [] }]
        });
    }

    async function updateHolidaysAndWeekends(data) {
        // data = { weekends: [5,6], holidays: [...] }
        await updateDoc(doc(db, "settings", "global"), {
            weekends: data.weekends || [],
            holidays: data.holidays || []
        });
    }

    async function updateNotificationSettings(data) {
        // data = { defaultReminders: [...] }
        await updateDoc(doc(db, "settings", "global"), {
            notifications: data
        });
    }

    const value = {
        settings,
        activeProfile,
        loading,
        switchProfile,
        saveTimeProfile,
        updateSchoolInfo,
        updateEventTypes,
        updateGrades,
        updateHolidaysAndWeekends,
        updateNotificationSettings,
        // Convenience Getters
        grades: settings?.grades || [],
        eventTypes: settings?.eventTypes || [],
        schoolInfo: settings?.schoolInfo || {},
        weekends: settings?.weekends || [],
        holidays: settings?.holidays || []
    };

    return (
        <SettingsContext.Provider value={value}>
            {!loading && children}
        </SettingsContext.Provider>
    );
}
