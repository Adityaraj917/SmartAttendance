import { BleManager, Device } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import * as ExpoDevice from 'expo-device';

// Global instance
export const manager = new BleManager();

export const requestBlePermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
        if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                    title: 'Location Permission',
                    message: 'Bluetooth Low Energy requires Location',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } else {
            const result = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);

            return (
                result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
            );
        }
    }
    // iOS handles permissions automatically via Info.plist
    return true;
};

export const scanForBeacon = (serviceUUID: string, duration = 5000): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        let found = false;
        console.log(`[BLE] Starting scan for ${serviceUUID}`);

        // Scan
        manager.startDeviceScan(null, null, (error, device) => {
            if (error) {
                console.warn('[BLE] Scan Error:', error);
                // If simulator or specific error, might want to fail gracefully
                return;
            }

            // Check if device matches
            // Note: serviceUUIDs might be null in advertisement, need to handle
            // Sometimes UUID is in overflow area or serviceData
            if (device && (device.serviceUUIDs || []).includes(serviceUUID)) {
                console.log('[BLE] Found Device:', device.name, device.id);
                found = true;
                manager.stopDeviceScan();
                resolve(true);
            }

            // Allow matching by LocalName if UUID isn't broadcasted (common in some beacon modes)
            // But prompt says "Teacher broadcasts session UUID".
        });

        // Timeout
        setTimeout(() => {
            if (!found) {
                console.log('[BLE] Scan timeout, not found');
                manager.stopDeviceScan();
                resolve(false);
            }
        }, duration);
    });
};
