import { useLocalSearchParams } from 'expo-router';

import { EditorScreen } from '../../editor/ui/EditorScreen';

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditorScreen id={String(id)} />;
}
