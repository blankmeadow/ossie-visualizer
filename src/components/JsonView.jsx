import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { foldEffect, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { FileJson, ListCollapse, ListTree, Search } from 'lucide-react'
import { useT } from '../lib/i18n'
import { topLevelContainerRanges } from '../lib/json'

function openJsonSearch(editorView) {
  unfoldAll(editorView)
  return openSearchPanel(editorView)
}

export default function JsonView({ document }) {
  const t = useT()
  const [editorView, setEditorView] = useState(null)
  const source = useMemo(() => JSON.stringify(document, null, 2), [document])
  const topLevelRanges = useMemo(() => topLevelContainerRanges(source), [source])
  const extensions = useMemo(() => [
    json(),
    Prec.highest(keymap.of([{ key: 'Mod-f', run: openJsonSearch }])),
  ], [])

  const runEditorCommand = (command) => {
    if (!editorView) return
    command(editorView)
    editorView.focus()
  }

  const foldToTopLevel = () => {
    if (!editorView) return
    unfoldAll(editorView)
    editorView.dispatch({
      selection: { anchor: 0 },
      effects: topLevelRanges.map((range) => foldEffect.of(range)),
    })
    editorView.focus()
  }

  return (
    <main className="json-view">
      <header>
        <div><span className="eyebrow">{t('json.eyebrow')}</span><h1>{t('json.title')}</h1></div>
        <div className="json-view__actions">
          <span className="json-view__status"><FileJson size={15} />{t('json.readonly')}</span>
          <button type="button" onClick={() => editorView && openJsonSearch(editorView)} disabled={!editorView}><Search size={14} />{t('json.search')}<kbd>⌘/Ctrl F</kbd></button>
          <button type="button" onClick={foldToTopLevel} disabled={!editorView}><ListCollapse size={14} />{t('json.foldTop')}</button>
          <button type="button" onClick={() => runEditorCommand(unfoldAll)} disabled={!editorView}><ListTree size={14} />{t('json.unfoldAll')}</button>
        </div>
      </header>
      <div className="json-editor">
        <CodeMirror
          className="json-codemirror"
          value={source}
          height="100%"
          extensions={extensions}
          editable={false}
          readOnly
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
            closeBrackets: false,
          }}
          onCreateEditor={setEditorView}
        />
      </div>
    </main>
  )
}
