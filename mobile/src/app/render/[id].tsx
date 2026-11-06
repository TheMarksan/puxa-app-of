import { useLocalSearchParams } from 'expo-router';

import { RenderScreen } from '../../editor/ui/RenderScreen';

export default function Render() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RenderScreen id={String(id)} />;
}
