import '@countertek/react-native-esc-pos-printer';

import { StyleSheet, Text, View } from 'react-native';

export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ESC/POS Printer</Text>
      <Text style={styles.body}>Native module scaffold is ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  body: {
    marginTop: 8,
    color: '#555',
    fontSize: 16,
  },
});
