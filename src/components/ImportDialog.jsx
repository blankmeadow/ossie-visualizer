import { useState } from 'react'
import { FileJson, UploadCloud, X } from 'lucide-react'

export default function ImportDialog({ open, onClose, onImport, errors = [] }) {
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
    onImport(text, fileName || 'pasted-ossie.json')
  }

  return (
    <div className="ossie-import-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="ossie-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">LOCAL IMPORT</span>
            <h2 id="ossie-import-title">打开 Ossie JSON</h2>
            <p>文件只在浏览器内解析，不会上传到服务器。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
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
          <strong>{fileName || '拖入 JSON，或点击选择文件'}</strong>
          <span>支持纯 Ontology 和包含 Semantic Model/Mapping 的完整 Ossie 文档</span>
        </label>
        <input
          id="ossie-json-file"
          name="ossie_json_file"
          className="visually-hidden-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => readFile(event.target.files?.[0])}
        />

        <div className="import-divider"><span>或者粘贴</span></div>
        <textarea
          id="ossie-json-text"
          name="ossie_json_text"
          aria-label="粘贴 Ossie JSON"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'{\n  "version": "0.2.0.dev0",\n  "name": "...",\n  "ontology": []\n}'}
          spellCheck="false"
        />
        {!!errors.length && (
          <div className="import-errors">
            <strong>无法加载，发现 {errors.length} 个问题</strong>
            {errors.slice(0, 5).map((error) => (
              <div key={`${error.path}:${error.message}`}><code>{error.path}</code><span>{error.message}</span></div>
            ))}
            {errors.length > 5 && <small>还有 {errors.length - 5} 个问题未显示</small>}
          </div>
        )}
        <footer>
          <span><FileJson size={15} /> JSON 在加载前会先做结构和引用检查</span>
          <div>
            <button className="button button--ghost" onClick={onClose}>取消</button>
            <button className="button button--primary" disabled={!text.trim()} onClick={submit}>解析并打开</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
