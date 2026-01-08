export interface GeoLocation {
    lat: number;
    lon: number;
    accuracy?: number; // in meters
    timestamp?: number;
}

/**
 * Calculates the distance between two points in meters using the Haversine formula.
 */
export const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

/**
 * Promisified getCurrentPosition with High Accuracy enforcement.
 */
export const getCurrentLocation = (): Promise<GeoLocation> => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));

        // Options for High Accuracy
        const highAccuracyOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
        // Options for Low Accuracy (Fallback)
        const lowAccuracyOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 };

        // 1. Try High Accuracy
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp
                });
            },
            (errHigh) => {
                console.warn("High Accuracy Geo failed, trying low accuracy...", errHigh);

                // 2. Fallback: Try Low Accuracy (WiFi/IP)
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        console.log("Low Accuracy Geo succeeded");
                        resolve({
                            lat: pos.coords.latitude,
                            lon: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            timestamp: pos.timestamp
                        });
                    },
                    (errLow) => {
                        console.error("All Geo attempts failed", errLow);
                        reject(errHigh); // Reject with original error
                    },
                    lowAccuracyOptions
                );
            },
            highAccuracyOptions
        );
    });
};
