import { useLocalSearchParams } from 'expo-router';

import { FolderScreen } from '../../screens/FolderScreen';

export default function Pasta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FolderScreen id={String(id)} />;
}
