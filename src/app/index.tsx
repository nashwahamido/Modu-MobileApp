// This is the homepage of modu

import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modu</Text>
      <Text style={styles.sub}>Build furniture, step by step</Text>
      <Link href="/catalogue" asChild>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Start building</Text>
        </Pressable>
      </Link>
      {__DEV__ && (
        <Link href="/engine-test" asChild>
          <Pressable style={styles.devLink}>
            <Text style={styles.devLinkText}>engine test (dev)</Text>
          </Pressable>
        </Link>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16162a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: '600',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
  },
  button: {
    marginTop: 32,
    backgroundColor: '#5b6cff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  buttonPressed: {
    backgroundColor: '#4a59d9',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  devLink: {
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  devLinkText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});