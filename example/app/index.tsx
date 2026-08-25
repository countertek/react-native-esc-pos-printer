import {
  getDiscoveryPermissions,
  requestDiscoveryPermissions,
  usePrintersDiscovery,
} from '@countertek/react-native-esc-pos-printer';
import type { PermissionResponse } from 'expo';
import { useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';

export default function DiscoveryScreen() {
  const { printers, isDiscovering, printerError, start, stop } = usePrintersDiscovery();
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  async function requestPermissionAndStart() {
    setPermissionError(null);
    try {
      const current = await getDiscoveryPermissions();
      const next = current.granted ? current : await requestDiscoveryPermissions();
      setPermission(next);
      if (next.granted) {
        start();
      }
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error));
    }
  }

  function stopDiscovery() {
    setPermissionError(null);
    try {
      stop();
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error));
    }
  }

  const errorMessage = permissionError ?? printerError?.message;

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={printers}
      keyExtractor={(printer) => printer.target}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Printer Discovery</Text>
          <View style={styles.actions}>
            <Button
              disabled={isDiscovering}
              onPress={() => void requestPermissionAndStart()}
              title="Find printers"
            />
            <Button disabled={!isDiscovering} onPress={stopDiscovery} title="Stop" />
          </View>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {!errorMessage && permission && !permission.granted ? (
            <Text style={styles.error}>
              Discovery permission denied. Enable Bluetooth, Nearby Devices, or Location in
              Settings.
            </Text>
          ) : null}
          {!errorMessage && isDiscovering ? (
            <Text style={styles.status}>Finding printers…</Text>
          ) : null}
          {!errorMessage && permission?.granted && !isDiscovering && printers.length === 0 ? (
            <Text style={styles.status}>
              No printers found. Check Local Network permission and printer connectivity.
            </Text>
          ) : null}
          {!permission && !errorMessage ? (
            <Text style={styles.status}>Permission is requested before Discovery starts.</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.printer}>
          <Text style={styles.deviceName}>{item.deviceName || 'Unknown Device Name'}</Text>
          <Text>Target: {item.target}</Text>
          <Text>Device type: {item.deviceType}</Text>
          <Text>IP address: {item.ipAddress || '—'}</Text>
          <Text>MAC address: {item.macAddress || '—'}</Text>
          <Text>Bluetooth address: {item.bdAddress || '—'}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    gap: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  status: {
    color: '#555',
    fontSize: 16,
  },
  error: {
    color: '#b00020',
    fontSize: 16,
  },
  printer: {
    borderColor: '#ddd',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    marginBottom: 12,
    padding: 16,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
  },
});
