import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { usePalette } from '../theme';
import { Create } from './Create';

/** Modo Criar: o editor de vídeo e os projetos guardados. */
export function CreateScreen() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="Criar" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32 }}>
        <Create header={null} />
      </ScrollView>
    </View>
  );
}
