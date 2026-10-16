import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { loadGalleries, webOrigin, type Gallery } from './src/galleries';
import { GalleryScreen, HomeScreen, PhotoViewer, Wordmark } from './src/screens';
import { colors } from './src/theme';

/** Memory — mobile: gallery tiles → gallery grid → swipeable full-screen viewer. */
export default function App(): ReactElement {
  const origin = webOrigin();
  const [galleries, setGalleries] = useState<readonly Gallery[] | null>(null);
  const [open, setOpen] = useState<Gallery | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void loadGalleries(origin).then((list) => {
      if (active) setGalleries(list);
    });
    return (): void => {
      active = false;
    };
  }, [origin]);

  let body: ReactElement;
  if (!origin) {
    body = (
      <View style={styles.center}>
        <Wordmark />
        <Text style={styles.note}>Set EXPO_PUBLIC_WEB_URL to the deployed web address.</Text>
      </View>
    );
  } else if (galleries === null) {
    body = <ActivityIndicator style={styles.center} color={colors.muted} />;
  } else if (open) {
    body = (
      <GalleryScreen origin={origin} gallery={open} onBack={(): void => setOpen(null)} onPhoto={setPhoto} />
    );
  } else {
    body = <HomeScreen origin={origin} galleries={galleries} onOpen={setOpen} />;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {body}
      {open && photo !== null && (
        <PhotoViewer origin={origin} gallery={open} index={photo} onClose={(): void => setPhoto(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  note: { color: colors.muted, textAlign: 'center' },
});
