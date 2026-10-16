import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { loadTopic, loadTopics, webOrigin, type Topic, type TopicDetail } from './src/galleries';
import { GalleryScreen, HomeScreen, PhotoViewer, Wordmark } from './src/screens';
import { colors } from './src/theme';

/** Memory — mobile: topic tiles → topic grid → swipeable full-screen viewer with captions. */
export default function App(): ReactElement {
  const origin = webOrigin();
  const [topics, setTopics] = useState<readonly Topic[] | null>(null);
  const [open, setOpen] = useState<TopicDetail | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [photo, setPhoto] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void loadTopics(origin).then((list) => {
      if (active) setTopics(list);
    });
    return (): void => {
      active = false;
    };
  }, [origin]);

  const openTopic = (t: Topic): void => {
    setLoadingTopic(true);
    void loadTopic(origin, t.slug).then((detail) => {
      setLoadingTopic(false);
      if (detail) setOpen(detail);
    });
  };

  let body: ReactElement;
  if (!origin) {
    body = (
      <View style={styles.center}>
        <Wordmark />
        <Text style={styles.note}>Set EXPO_PUBLIC_WEB_URL to the deployed web address.</Text>
      </View>
    );
  } else if (topics === null || loadingTopic) {
    body = <ActivityIndicator style={styles.center} color={colors.muted} />;
  } else if (open) {
    body = <GalleryScreen topic={open} onBack={(): void => setOpen(null)} onPhoto={setPhoto} />;
  } else {
    body = <HomeScreen topics={topics} onOpen={openTopic} />;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {body}
      {open && photo !== null && <PhotoViewer topic={open} index={photo} onClose={(): void => setPhoto(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  note: { color: colors.muted, textAlign: 'center' },
});
