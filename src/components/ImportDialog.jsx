import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { issueText, useT } from '../lib/i18n'

/**
 * One surface: the editor is also the drop target.
 *
 * Pasting and dropping produce the same thing -- the text of a document -- so
 * splitting them into a drop panel and a separate box, with a divider between,
 * asked the reader to choose between two doors into the same room.
 */
export default function ImportDialog({ open, onClose, onImport, errors = [] }) {
  const t = useT()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const textarea = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  if (!open) return null

  const readFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    setText(await file.text())
    textarea.current?.focus()
  }

  const submit = () => {
    if (!text.trim()) return
    onImport(text)
  }

  return (
    <div className="ossie-import-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ossie-import-title"
        onMouseDown={(event) => event.stopPropagation()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          readFile(event.dataTransfer.files?.[0])
        }}
      >
        <header>
          <h2 id="ossie-import-title">{t('import.title')}</h2>
          {!!fileName && <code className="import-dialog__file">{fileName}</code>}
          <button className="icon-button" onClick={onClose} aria-label={t('import.close')}><X size={17} /></button>
        </header>

        <div className={`import-dialog__source ${dragging ? 'is-dragging' : ''}`}>
          <textarea
            id="ossie-json-text"
            name="ossie_json_text"
            ref={textarea}
            aria-label={t('import.textarea')}
            value={text}
            onChange={(event) => { setText(event.target.value); setFileName('') }}
            placeholder={t('import.placeholder')}
            spellCheck="false"
          />
          {dragging && <div className="import-dialog__drop">{t('import.release')}</div>}
        </div>

        <label className="import-dialog__pick">
          {t('import.orChoose')}
          <input
            id="ossie-json-file"
            name="ossie_json_file"
            type="file"
            accept="application/json,application/yaml,text/yaml,.json,.yaml,.yml"
            onChange={(event) => readFile(event.target.files?.[0])}
          />
        </label>

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
          <span>{t('import.formats')}</span>
          <div>
            <button className="button button--ghost" onClick={onClose}>{t('import.cancel')}</button>
            <button className="button button--primary" disabled={!text.trim()} onClick={submit}>{t('import.submit')}</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
