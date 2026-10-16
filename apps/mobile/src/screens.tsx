import type { ReactElement } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { pictureMeta, type Topic, type TopicDetail } from './galleries';
import { colors, serif } from './theme';

const { width: SCREEN_W } = Dimensions.get('window');
const GUTTER = 16;

export function Wordmark(): ReactElement {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>MEMORY</Text>
      <Text style={styles.subtitle}>a life in photographs</Text>
    </View>
  );
}

interface HomeProps {
  readonly topics: readonly Topic[];
  readonly onOpen: (topic: Topic) => void;
}

export function HomeScreen({ topics, onOpen }: HomeProps): ReactElement {
  return (
    <FlatList
      data={topics}
      keyExtractor={(t): string => t.id}
      ListHeaderComponent={Wordmark}
      ListEmptyComponent={<Text style={styles.empty}>No galleries yet.</Text>}
      contentContainerStyle={styles.list}
      renderItem={({ item }): ReactElement => (
        <Pressable style={styles.tile} onPress={(): void => onOpen(item)} accessibilityRole="link">
          {item.cover && <Image source={{ uri: item.cover.display }} style={styles.tileImage} />}
          <Text style={styles.tileTitle}>{item.title}</Text>
        </Pressable>
      )}
    />
  );
}

interface GalleryProps {
  readonly topic: TopicDetail;
  readonly onBack: () => void;
  readonly onPhoto: (index: number) => void;
}

const THUMB = (SCREEN_W - GUTTER * 3) / 2;

export function GalleryScreen({ topic, onBack, onPhoto }: GalleryProps): ReactElement {
  return (
    <FlatList
      data={topic.pictures}
      numColumns={2}
      keyExtractor={(p): string => p.id}
      columnWrapperStyle={{ gap: GUTTER }}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text style={styles.crumbs}>‹ GALLERIES</Text>
          </Pressable>
          <Text style={styles.pageTitle}>{topic.title}</Text>
          {topic.description ? <Text style={styles.intro}>{topic.description}</Text> : null}
        </View>
      }
      renderItem={({ item, index }): ReactElement => (
        <Pressable onPress={(): void => onPhoto(index)} accessibilityLabel={item.caption ?? `Open photo ${index + 1}`}>
          <Image source={{ uri: item.images.thumb }} style={styles.thumb} />
        </Pressable>
      )}
    />
  );
}

interface ViewerProps {
  readonly topic: TopicDetail;
  readonly index: number;
  readonly onClose: () => void;
}

/** Full-screen, horizontally paged viewer with caption, date, place and story. */
export function PhotoViewer({ topic, index, onClose }: ViewerProps): ReactElement {
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <FlatList
          data={topic.pictures}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, i): { length: number; offset: number; index: number } => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          keyExtractor={(p): string => p.id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index: i }): ReactElement => {
            const meta = pictureMeta(item);
            return (
              <View style={styles.page}>
                <Image source={{ uri: item.images.display }} style={styles.full} resizeMode="contain" />
                <ScrollView style={styles.captionBox} contentContainerStyle={styles.captionContent}>
                  {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
                  {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                  {item.story ? <Text style={styles.story}>{item.story}</Text> : null}
                  <Text style={styles.count}>
                    {topic.title.toUpperCase()} · {i + 1} / {topic.pictures.length}
                  </Text>
                </ScrollView>
              </View>
            );
          }}
        />
        <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: GUTTER, paddingBottom: 48, backgroundColor: colors.paper, flexGrow: 1 },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
    marginBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  wordmark: { fontFamily: serif, fontSize: 30, letterSpacing: 9, color: colors.ink },
  subtitle: { fontFamily: serif, fontStyle: 'italic', color: colors.muted, marginTop: 4 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 24 },
  tile: { marginBottom: 32 },
  tileImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.rule },
  tileTitle: { fontFamily: serif, fontSize: 18, letterSpacing: 1.5, textAlign: 'center', marginTop: 10, color: colors.ink },
  crumbs: { fontSize: 12, letterSpacing: 2, color: colors.muted, textAlign: 'center', paddingTop: 24 },
  pageTitle: { fontFamily: serif, fontSize: 26, textAlign: 'center', marginTop: 20, marginBottom: 12, color: colors.ink },
  intro: { fontFamily: serif, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  thumb: { width: THUMB, height: THUMB * 0.75, marginBottom: GUTTER, backgroundColor: colors.rule },
  viewer: { flex: 1, backgroundColor: colors.night },
  page: { width: SCREEN_W, flex: 1, justifyContent: 'center', alignItems: 'center' },
  full: { width: SCREEN_W, height: '62%' },
  captionBox: { maxHeight: '26%', width: SCREEN_W },
  captionContent: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, gap: 6 },
  caption: { fontFamily: serif, fontSize: 17, color: '#f1efe9', textAlign: 'center' },
  meta: { fontSize: 13, color: '#b8b5ae' },
  story: { fontFamily: serif, fontSize: 14, lineHeight: 21, color: '#cfccc5', textAlign: 'center' },
  count: { color: '#888', fontSize: 11, letterSpacing: 2, marginTop: 4 },
  close: { position: 'absolute', top: 48, right: 20, padding: 8 },
  closeText: { color: '#ddd', fontSize: 22 },
});
