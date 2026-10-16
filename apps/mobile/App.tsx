import type { ReactElement } from 'react';
import { Text, View, StyleSheet } from 'react-native';

/**
 * Mobile shell for the memorial-site infrastructure baseline.
 * The new business domain replaces this with its own navigation/screens.
 */
export default function App(): ReactElement {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Memory</Text>
      <Text>Infrastructure baseline — mobile shell.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
});
