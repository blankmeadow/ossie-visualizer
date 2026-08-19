import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
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

/**
 * The document exactly as it was opened, in the language it was written in.
 * Re-serialising a YAML file as JSON would drop its comments -- including the
 * licence header Apache Ossie's own examples carry -- and show the reader
 * something they never wrote.
 */
export default function JsonView({ source }) {
  const t = useT()
  const [editorView, setEditorView] = useState(null)
  const text = source?.text || ''
  const isYaml = source?.format === 'yaml'
  // Folding to the top level is driven by a JSON brace scan, so it only
  // applies to JSON; YAML folds by indentation through the language mode.
  const topLevelRanges = useMemo(() => (isYaml ? [] : topLevelContainerRanges(text)), [isYaml, text])
  const extensions = useMemo(() => [
    isYaml ? yaml() : json(),
    Prec.highest(keymap.of([{ key: 'Mod-f', run: openJsonSearch }])),
  ], [isYaml])

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
        <div>
          <span className="eyebrow">{t('json.eyebrow')}</span>
          <h1>{isYaml ? t('json.titleYaml') : t('json.title')}</h1>
        </div>
        <div className="json-view__actions">
          <span className="json-view__status"><FileJson size={15} />{t('json.readonly')}</span>
          <button type="button" onClick={() => editorView && openJsonSearch(editorView)} disabled={!editorView}><Search size={14} />{t('json.search')}<kbd>⌘/Ctrl F</kbd></button>
          {!isYaml && <button type="button" onClick={foldToTopLevel} disabled={!editorView}><ListCollapse size={14} />{t('json.foldTop')}</button>}
          <button type="button" onClick={() => runEditorCommand(unfoldAll)} disabled={!editorView}><ListTree size={14} />{t('json.unfoldAll')}</button>
        </div>
      </header>
      <div className="json-editor">
        <CodeMirror
          className="json-codemirror"
          value={text}
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
