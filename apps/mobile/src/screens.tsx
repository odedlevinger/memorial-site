import type { ReactElement } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { imageUrl, type Gallery } from './galleries';
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
  readonly origin: string;
  readonly galleries: readonly Gallery[];
  readonly onOpen: (gallery: Gallery) => void;
}

export function HomeScreen({ origin, galleries, onOpen }: HomeProps): ReactElement {
  return (
    <FlatList
      data={galleries}
      keyExtractor={(g): string => g.slug}
      ListHeaderComponent={Wordmark}
      ListEmptyComponent={<Text style={styles.empty}>No galleries yet.</Text>}
      contentContainerStyle={styles.list}
      renderItem={({ item }): ReactElement => (
        <Pressable style={styles.tile} onPress={(): void => onOpen(item)} accessibilityRole="link">
          {item.images[0] !== undefined && (
            <Image source={{ uri: imageUrl(origin, item.images[0]) }} style={styles.tileImage} />
          )}
          <Text style={styles.tileTitle}>{item.title}</Text>
        </Pressable>
      )}
    />
  );
}

interface GalleryProps {
  readonly origin: string;
  readonly gallery: Gallery;
  readonly onBack: () => void;
  readonly onPhoto: (index: number) => void;
}

const THUMB = (SCREEN_W - GUTTER * 3) / 2;

export function GalleryScreen({ origin, gallery, onBack, onPhoto }: GalleryProps): ReactElement {
  return (
    <FlatList
      data={gallery.images}
      numColumns={2}
      keyExtractor={(name): string => name}
      columnWrapperStyle={{ gap: GUTTER }}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text style={styles.crumbs}>‹ GALLERIES</Text>
          </Pressable>
          <Text style={styles.pageTitle}>{gallery.title}</Text>
        </View>
      }
      renderItem={({ item, index }): ReactElement => (
        <Pressable onPress={(): void => onPhoto(index)} accessibilityLabel={`Open photo ${index + 1}`}>
          <Image source={{ uri: imageUrl(origin, item) }} style={styles.thumb} />
        </Pressable>
      )}
    />
  );
}

interface ViewerProps {
  readonly origin: string;
  readonly gallery: Gallery;
  readonly index: number;
  readonly onClose: () => void;
}

/** Full-screen, horizontally paged photo viewer — swipe between photos. */
export function PhotoViewer({ origin, gallery, index, onClose }: ViewerProps): ReactElement {
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <FlatList
          data={gallery.images}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, i): { length: number; offset: number; index: number } => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          keyExtractor={(name): string => name}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index: i }): ReactElement => (
            <View style={styles.page}>
              <Image source={{ uri: imageUrl(origin, item) }} style={styles.full} resizeMode="contain" />
              <Text style={styles.caption}>
                {gallery.title.toUpperCase()} · {i + 1} / {gallery.images.length}
              </Text>
            </View>
          )}
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
  pageTitle: { fontFamily: serif, fontSize: 26, textAlign: 'center', marginVertical: 20, color: colors.ink },
  thumb: { width: THUMB, height: THUMB * 0.75, marginBottom: GUTTER, backgroundColor: colors.rule },
  viewer: { flex: 1, backgroundColor: colors.night },
  page: { width: SCREEN_W, flex: 1, justifyContent: 'center', alignItems: 'center' },
  full: { width: SCREEN_W, height: '75%' },
  caption: { color: '#aaa', fontSize: 11, letterSpacing: 2, marginTop: 12 },
  close: { position: 'absolute', top: 48, right: 20, padding: 8 },
  closeText: { color: '#ddd', fontSize: 22 },
});
