import {
  Printer,
  PrinterConstants,
  PrinterError,
  type PrinterStatus,
} from '@countertek/react-native-esc-pos-printer';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function statusLine(label: string, field: PrinterStatus[keyof PrinterStatus]): string {
  return `${label}: ${field.status} (${field.message})`;
}

export default function PrinterScreen() {
  const params = useLocalSearchParams<{ target?: string; deviceName?: string }>();
  const [target, setTarget] = useState(firstParam(params.target));
  const [deviceName, setDeviceName] = useState(firstParam(params.deviceName));
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAct = target.length > 0 && deviceName.length > 0 && !busy;

  async function withPrinter(action: (printer: Printer) => Promise<void>) {
    if (!canAct) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await action(new Printer({ target, deviceName }));
    } catch (error) {
      setErrorMessage(error instanceof PrinterError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Printer' }} />
      <Text style={styles.title}>Printer session</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setTarget}
        placeholder="Target (TCP:192.168.1.50)"
        style={styles.input}
        value={target}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setDeviceName}
        placeholder="Device Name (TM-T88V)"
        style={styles.input}
        value={deviceName}
      />
      <View style={styles.actions}>
        <Button
          disabled={!canAct}
          onPress={() => void withPrinter((printer) => printer.connect())}
          title="Connect"
        />
        <Button
          disabled={!canAct}
          onPress={() =>
            void withPrinter(async (printer) => {
              setStatus(await printer.getStatus());
            })
          }
          title="Status"
        />
        <Button
          disabled={!canAct}
          onPress={() =>
            void withPrinter(async (printer) => {
              setStatus(
                await printer.run(async (buffer) => {
                  await buffer.addTextAlign(PrinterConstants.ALIGN_CENTER);
                  await buffer.addTextSize({ width: 2, height: 2 });
                  await buffer.addText('Hello\n');
                  await buffer.addTextSize({ width: 1, height: 1 });
                  await buffer.addTextSmooth(PrinterConstants.TRUE);
                  await buffer.addText('Text receipt\n');
                  await buffer.addTextSmooth(PrinterConstants.FALSE);
                  await buffer.addTextStyle({ em: PrinterConstants.TRUE });
                  await buffer.addText('Bold line\n');
                  await buffer.addTextStyle();
                  await buffer.addTextAlign(PrinterConstants.ALIGN_LEFT);
                  await buffer.addText('Left\n');
                  await buffer.addTextAlign(PrinterConstants.ALIGN_RIGHT);
                  await buffer.addText('Right\n');
                  await buffer.addFeedLine(2);
                  await buffer.addCut();
                  return buffer.sendData();
                })
              );
            })
          }
          title="Print"
        />
        <Button
          disabled={!canAct}
          onPress={() => void withPrinter((printer) => printer.disconnect())}
          title="Disconnect"
        />
      </View>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {status ? (
        <View style={styles.status}>
          <Text>{statusLine('Connection', status.connection)}</Text>
          <Text>{statusLine('Online', status.online)}</Text>
          <Text>{statusLine('Cover', status.coverOpen)}</Text>
          <Text>{statusLine('Paper', status.paper)}</Text>
          <Text>{statusLine('Error', status.errorStatus)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  input: {
    borderColor: '#ddd',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  error: {
    color: '#b00020',
    fontSize: 16,
  },
  status: {
    gap: 4,
  },
});
