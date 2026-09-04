import WikiEditorGate from '@/components/WikiEditorGate';

export const dynamic = 'force-dynamic';

export default function NewWikiPage() {
  return (
    <WikiEditorGate
      targetId={null}
      initial={{ slug: '', title: '', pageType: 'general', summary: '', infobox: [], body: '' }}
    />
  );
}
