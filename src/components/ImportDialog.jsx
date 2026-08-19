import { useState } from 'react'
import { FileJson, UploadCloud, X } from 'lucide-react'
import { issueText, useT } from '../lib/i18n'

export default function ImportDialog({ open, onClose, onImport, errors = [] }) {
  const t = useT()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  if (!open) return null

  const readFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    setText(await file.text())
  }

  const submit = () => {
    if (!text.trim()) return
    onImport(text)
  }

  return (
    <div className="ossie-import-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="ossie-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">LOCAL IMPORT</span>
            <h2 id="ossie-import-title">{t('import.title')}</h2>
            <p>{t('import.subtitle')}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('import.close')}><X size={18} /></button>
        </header>

        <label
          htmlFor="ossie-json-file"
          className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            readFile(event.dataTransfer.files?.[0])
          }}
        >
          <UploadCloud size={25} />
          <strong>{fileName || t('import.dropzone')}</strong>
          <span>{t('import.dropzoneHint')}</span>
        </label>
        <input
          id="ossie-json-file"
          name="ossie_json_file"
          className="visually-hidden-input"
          type="file"
          accept="application/json,application/yaml,text/yaml,.json,.yaml,.yml"
          onChange={(event) => readFile(event.target.files?.[0])}
        />

        <div className="import-divider"><span>{t('import.divider')}</span></div>
        <textarea
          id="ossie-json-text"
          name="ossie_json_text"
          aria-label={t('import.textarea')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'{\n  "version": "0.2.0.dev0",\n  "name": "...",\n  "ontology": []\n}'}
          spellCheck="false"
        />
        {!!errors.length && (
          <div className="import-errors">
            <strong>{t('import.errorTitle', { count: errors.length })}</strong>
            {errors.slice(0, 5).map((error) => (
              <div key={`${error.path}:${error.code}`}><code>{error.path}</code><span>{issueText(error, t)}</span></div>
            ))}
            {errors.length > 5 && <small>{t('import.errorMore', { count: errors.length - 5 })}</small>}
          </div>
        )}
        <footer>
          <span><FileJson size={15} /> {t('import.note')}</span>
          <div>
            <button className="button button--ghost" onClick={onClose}>{t('import.cancel')}</button>
            <button className="button button--primary" disabled={!text.trim()} onClick={submit}>{t('import.submit')}</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
