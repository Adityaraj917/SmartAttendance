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
export const getCurrentLocation = (maxAgeMs: number = 10000): Promise<GeoLocation> => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp
                });
            },
            (err) => {
                let msg = "Unknown GPS Error";
                switch (err.code) {
                    case err.PERMISSION_DENIED: msg = "Location permission denied. Please enable location services."; break;
                    case err.POSITION_UNAVAILABLE: msg = "Location information is unavailable."; break;
                    case err.TIMEOUT: msg = "The request to get user location timed out."; break;
                }
                reject(new Error(msg));
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: maxAgeMs // Accept cached positions up to X ms old
            }
        );
    });
};
